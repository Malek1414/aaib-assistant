import { CANONICAL_ORIGIN, inScope, USER_AGENT } from "./config.ts";
import { politeGet } from "./http.ts";
import { isAllowed, looksLikeRobots, parseRobots, type RobotsRules } from "./robots.ts";

export type Locale = "en" | "ar";

export interface Capture {
  timestamp: string;
  original: string;
  length: number;
}

export interface Target {
  /** Canonical public URL used for citations, e.g. https://www.aaib.com/ar/smes/lending */
  url: string;
  path: string;
  locale: Locale;
  /** Candidate archive captures, newest first. */
  captures: Capture[];
}

export interface RobotsDecision {
  source: "live" | "archive" | "none";
  note: string;
  rules: RobotsRules | null;
}

/**
 * Robots policy. The live site sits behind a WAF that rejects automated
 * clients (it returns a "Request Rejected" HTML page, also for robots.txt).
 * We read that as "automated access to the live site is not welcome" and do
 * not try to get around it. Instead the crawler reads public captures from the
 * Internet Archive, at one request every two seconds. If any parseable
 * robots.txt can be found, its rules are still applied to every path.
 */
export async function resolveRobots(): Promise<RobotsDecision> {
  const live = await politeGet(`${CANONICAL_ORIGIN}/robots.txt`, { cache: false }).catch(() => null);
  if (live && live.status === 200 && looksLikeRobots(live.body)) {
    return { source: "live", note: "live robots.txt parsed", rules: parseRobots(live.body, USER_AGENT) };
  }
  const cdx = await politeGet(
    "https://web.archive.org/cdx/search/cdx?url=aaib.com/robots.txt&fl=timestamp,original&filter=statuscode:200&limit=-20",
  );
  const rows = cdx.body.trim().split("\n").filter(Boolean).reverse();
  for (const row of rows.slice(0, 6)) {
    const [ts, original] = row.split(" ");
    const snap = await politeGet(`https://web.archive.org/web/${ts}id_/${original}`);
    if (snap.status === 200 && looksLikeRobots(snap.body)) {
      return { source: "archive", note: `archived robots.txt ${ts}`, rules: parseRobots(snap.body, USER_AGENT) };
    }
  }
  return {
    source: "none",
    note:
      "live robots.txt is blocked by a WAF (HTML 'Request Rejected'); recent archived copies are the same WAF page. " +
      "Policy: never crawl the live site, read only Internet Archive captures, restrict to an explicit allowlist of public product/FAQ/support paths.",
    rules: null,
  };
}

/** Normalise an archived URL into (locale, path) on the canonical origin. */
export function normalise(original: string): { locale: Locale; path: string } | null {
  let u: URL;
  try {
    u = new URL(original.replace(/^http:/, "https:"));
  } catch {
    return null;
  }
  if (!/(^|\.)aaib\.com$/.test(u.hostname)) return null;
  if (u.search) return null;
  let path: string;
  try {
    path = decodeURI(u.pathname).replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
  let locale: Locale = "en";
  const m = path.match(/^\/(en|ar)(\/.*)?$/);
  if (m) {
    locale = m[1] as Locale;
    path = m[2] ?? "/";
  }
  return { locale, path };
}

export async function discoverTargets(robots: RobotsDecision): Promise<Target[]> {
  const url =
    "https://web.archive.org/cdx/search/cdx?url=aaib.com/*&fl=original,timestamp,length&filter=statuscode:200&filter=mimetype:text/html&from=2024";
  const res = await politeGet(url);
  if (res.status !== 200) throw new Error(`CDX listing failed: ${res.status}`);
  const byKey = new Map<string, Target>();
  for (const line of res.body.split("\n")) {
    const [original, timestamp, length] = line.trim().split(" ");
    if (!original || !timestamp) continue;
    const n = normalise(original);
    if (!n || !inScope(n.path)) continue;
    const localePath = n.locale === "ar" ? `/ar${n.path}` : n.path;
    if (robots.rules && !isAllowed(robots.rules, localePath)) continue;
    const key = `${n.locale}:${n.path}`;
    let t = byKey.get(key);
    if (!t) {
      const canonicalPath = n.locale === "ar" ? `/ar${n.path}` : `/en${n.path}`;
      t = { url: CANONICAL_ORIGIN + encodeURI(canonicalPath), path: n.path, locale: n.locale, captures: [] };
      byKey.set(key, t);
    }
    t.captures.push({ timestamp, original, length: Number(length) || 0 });
  }
  for (const t of byKey.values()) {
    // WAF rejection pages and redirects archive as tiny bodies; real pages are >3 KB compressed.
    t.captures = t.captures.filter((c) => c.length > 3000).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  return [...byKey.values()].filter((t) => t.captures.length > 0).sort((a, b) => a.url.localeCompare(b.url));
}
