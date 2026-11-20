import { createHash } from "node:crypto";
import { politeGet } from "./http.ts";
import type { Target } from "./discover.ts";

export interface RawPage {
  url: string;
  locale: "en" | "ar";
  path: string;
  archiveUrl: string;
  captureTimestamp: string;
  sha256: string;
  bytes: number;
  html: string;
}

export interface LedgerEntry {
  url: string;
  archiveUrl: string;
  captureTimestamp?: string;
  status: "ok" | "rejected" | "error";
  reason?: string;
  sha256?: string;
  bytes?: number;
}

/** A capture is usable only if it is real page HTML, not a WAF or Wayback error page. */
export function isUsableHtml(html: string): string | null {
  if (/Request Rejected/i.test(html) && html.length < 2000) return "waf-rejection-page";
  if (/Wayback Machine has not archived/i.test(html)) return "not-archived";
  if (!/<html/i.test(html)) return "not-html";
  if (html.length < 3000) return "too-small";
  return null;
}

export async function fetchBestCapture(t: Target, maxTries = 3): Promise<{ page?: RawPage; ledger: LedgerEntry[] }> {
  const ledger: LedgerEntry[] = [];
  for (const c of t.captures.slice(0, maxTries)) {
    // `id_` asks the Wayback Machine for the original bytes, without its toolbar or rewritten links.
    const archiveUrl = `https://web.archive.org/web/${c.timestamp}id_/${c.original}`;
    try {
      const res = await politeGet(archiveUrl);
      const bad = res.status !== 200 ? `http-${res.status}` : isUsableHtml(res.body);
      if (bad) {
        ledger.push({ url: t.url, archiveUrl, captureTimestamp: c.timestamp, status: "rejected", reason: bad });
        continue;
      }
      const sha256 = createHash("sha256").update(res.body).digest("hex");
      const bytes = Buffer.byteLength(res.body);
      ledger.push({ url: t.url, archiveUrl, captureTimestamp: c.timestamp, status: "ok", sha256, bytes });
      return {
        page: { url: t.url, locale: t.locale, path: t.path, archiveUrl, captureTimestamp: c.timestamp, sha256, bytes, html: res.body },
        ledger,
      };
    } catch (err) {
      ledger.push({ url: t.url, archiveUrl, captureTimestamp: c.timestamp, status: "error", reason: String(err) });
    }
  }
  return { ledger };
}
