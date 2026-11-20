/**
 * Link extraction helpers. Every link in the snapshot goes through here:
 *   archive-prefix stripping -> resolution against the page's live URL ->
 *   canonical www.aaib.com form -> kind classification -> safety filters.
 *
 * The Internet Archive is only the transport. Links always point at the live
 * public site (or the external target), never at a web.archive.org wrapper.
 */
import { detectInjection } from "../src/core/guardrails/injection.ts";
import { redactPii } from "../src/core/guardrails/pii.ts";
import { toWesternDigits } from "../src/core/text.ts";
import type { Link, LinkKind } from "../src/core/types.ts";

export const MAX_LINK_TEXT = 120;
const SITE_HOST = /(^|\.)aaib\.com$/i;
const APP_STORE_HOSTS = /^(apps\.apple\.com|itunes\.apple\.com|play\.google\.com|appgallery\.huawei\.com)$/i;

const clean = (s: string) => s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, "").replace(/\s+/g, " ").trim();

/**
 * `https://web.archive.org/web/20250101000000id_/https://aaib.com/x` -> `https://aaib.com/x`.
 * Also handles the root-relative `/web/<ts>/...` form that Wayback rewrites links into,
 * protocol-relative `//web.archive.org/...`, and the single-slash `http:/aaib.com` quirk.
 */
export function stripArchivePrefix(href: string): string {
  const m = href.match(/^(?:(?:https?:)?\/\/(?:www\.)?web\.archive\.org)?\/web\/\d{1,14}(?:[a-z]{2}_|id_|\*)?\/(.+)$/i);
  if (!m) return href;
  let inner = m[1];
  inner = inner.replace(/^(https?):\/(?!\/)/i, "$1://");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(inner)) inner = "https://" + inner.replace(/^\/+/, "");
  return inner;
}

/** Original page URL behind an archive URL, used as the base for relative links. */
export function liveBaseUrl(archiveUrl: string, fallback: string): string {
  const inner = stripArchivePrefix(archiveUrl);
  return inner !== archiveUrl ? inner : fallback;
}

/**
 * Resolve an href found on a page to an absolute live URL, or null when it is
 * not a followable link (anchors, javascript:, data:, empty).
 * aaib.com links are canonicalised to https://www.aaib.com with a locale prefix
 * (no prefix on the site means English), matching the citation URLs.
 */
export function resolveHref(rawHref: string, base: string): string | null {
  const href = rawHref.trim();
  if (!href || href.startsWith("#") || /^(javascript|data|about|blob):/i.test(href)) return null;
  if (/^tel:/i.test(href)) {
    const num = decodeSafe(href.slice(4)).replace(/[^\d+]/g, "");
    return num.replace(/\D/g, "").length >= 3 ? `tel:${num}` : null;
  }
  if (/^mailto:/i.test(href)) {
    const addr = decodeSafe(href.slice(7)).split("?")[0].trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(addr) ? `mailto:${addr}` : null;
  }
  let u: URL;
  try {
    u = new URL(stripArchivePrefix(href), stripArchivePrefix(base));
  } catch {
    return null;
  }
  // A relative link inside an archived page can resolve onto the archive host itself.
  if (/(^|\.)web\.archive\.org$/i.test(u.hostname)) {
    const inner = stripArchivePrefix(u.pathname + u.search);
    if (inner === u.pathname + u.search) return null;
    try {
      u = new URL(inner);
    } catch {
      return null;
    }
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  if (SITE_HOST.test(u.hostname)) {
    if (u.hostname === "aaib.com" || u.hostname === "www.aaib.com") {
      u.hostname = "www.aaib.com";
      u.protocol = "https:";
      let path = u.pathname.replace(/\/+$/, "") || "/";
      // Site bug: a relative "en/smes/x" on /smes/y resolves to /smes/en/smes/x. Restart at the locale segment.
      const inner = path.match(/^\/(?!en\/|ar\/)[^?#]*?(\/(en|ar)\/.*)$/);
      if (inner) path = inner[1];
      const isFile = /\.[a-z0-9]{2,5}$/i.test(path) || /^\/(pdfs|images|sites|_next|assets|files)\//i.test(path);
      if (!isFile && !/^\/(en|ar)(\/|$)/.test(path)) path = "/en" + (path === "/" ? "" : path);
      u.pathname = path;
    }
  }
  return u.toString();
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const FORM_PATH = /(^|[/_.-])(forms?|apply|application|request|register|registration|sign-?up|subscribe|enrol+(ment)?|open-account)([/_.-]|$)/i;
const FORM_TEXT = /^(apply( now| online| here)?|apply for\b|request\b|register\b|subscribe\b|sign up\b|open an account|fill (in|out)\b|قدم|اطلب|سجل|اشترك|افتح حساب|نموذج|استمارة)/i;

export function classifyLink(href: string, text = ""): LinkKind {
  if (href.startsWith("tel:")) return "phone";
  if (href.startsWith("mailto:")) return "email";
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return "external";
  }
  if (APP_STORE_HOSTS.test(u.hostname)) return "app_store";
  if (/\.pdf$/i.test(u.pathname)) return "pdf";
  if (/\.(docx?|xlsx?|rtf|odt)$/i.test(u.pathname)) return "form";
  const site = SITE_HOST.test(u.hostname);
  if (site && (FORM_PATH.test(u.pathname) || FORM_TEXT.test(clean(text)))) return "form";
  if (site) return "page";
  return "external";
}

/** Readable label when the anchor has no text (icon or badge links). */
export function fallbackLabel(href: string, kind: LinkKind): string {
  if (kind === "phone") return href.slice(4);
  if (kind === "email") return href.slice(7);
  try {
    const u = new URL(href);
    if (kind === "app_store") return /apple/i.test(u.hostname) ? "App Store" : /huawei/i.test(u.hostname) ? "AppGallery" : "Google Play";
    const last = decodeSafe(u.pathname.split("/").filter(Boolean).pop() ?? u.hostname);
    return last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || u.hostname;
  } catch {
    return href;
  }
}

/** Egyptian mobile numbers are personal; institutional landlines and short codes (19555) are not. */
const PERSONAL_MOBILE = /^(?:\+?20|0020)?0?1[0125]\d{8}$/;

/**
 * Same guardrails as the page text:
 *  - link text that looks like a prompt injection drops the link;
 *  - PII in link text is redacted; a link whose *target* is personal data
 *    (a mobile number, an e-mail outside the bank's domains) is dropped.
 * The bank's own public contacts (tel:19555, landlines, @aaib.com) are kept.
 */
export function safeLink(link: Link): Link | null {
  const text = clean(link.text).slice(0, MAX_LINK_TEXT);
  if (detectInjection(text).flagged || detectInjection(link.href).flagged) return null;
  if (link.kind === "phone" && PERSONAL_MOBILE.test(link.href.slice(4).replace(/\D/g, "").replace(/^0020/, "20"))) return null;
  if (link.kind === "email" && !/@([a-z0-9-]+\.)*aaib\.com$/i.test(link.href)) return null;
  const contactValue = link.kind === "phone" ? link.href.slice(4) : link.kind === "email" ? link.href.slice(7) : "";
  // The visible text of a contact link is usually the number or address itself: allowed once vetted above.
  const label = contactValue && text.replace(/[\s-]/g, "").toLowerCase() === contactValue.replace(/[\s-]/g, "").toLowerCase()
    ? text
    : redactPii(text).text;
  if (!label || /^\[[A-Z_]+\]$/.test(label)) return contactValue ? { ...link, text: contactValue } : null;
  return { ...link, text: label };
}

/** Language switchers ("عربي", "غير اللغة: English") are site chrome, not answers. */
const LANG_SWITCH = /^(change language|english|عربي|العربية)$|غ[\u064B-\u0652]*ي[\u064B-\u0652]*ر[\u064B-\u0652]*\s*ا?للغة|change language/i;

/** Build a vetted link from a raw anchor, or null. */
export function makeLink(rawHref: string, rawText: string, base: string): Link | null {
  const href = resolveHref(rawHref, base);
  if (!href) return null;
  const text0 = clean(rawText);
  if (LANG_SWITCH.test(text0)) return null;
  const kind = classifyLink(href, text0);
  // "Download" / "Find out more" says nothing in a list of links: name the target instead.
  const urlLike = /^(https?:\/\/|www\.)\S+$/i.test(text0);
  let text = text0;
  if (urlLike && kind === "external") text = text0.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  else if (!text0 || urlLike || isGeneric(text0)) {
    const named = fallbackLabel(href, kind);
    text = kind === "phone" || kind === "email" ? named : named.charAt(0).toUpperCase() + named.slice(1);
  }
  return safeLink({ text, href, kind });
}

/** Dedupe by href, keeping the first occurrence but preferring a more descriptive label. */
export function dedupeLinks(links: Link[]): Link[] {
  const byHref = new Map<string, Link>();
  for (const l of links) {
    const prev = byHref.get(l.href);
    if (!prev) byHref.set(l.href, l);
    else if (isGeneric(prev.text) && !isGeneric(l.text)) byHref.set(l.href, { ...prev, text: l.text });
  }
  return [...byHref.values()];
}

const GENERIC = /^\*?\s*(download|learn more|read more|know more|find out more|click here|here|more|details|تحميل|اضغط هنا|المزيد|اعرف المزيد|تعرف على المزيد)$/i;
export const isGeneric = (t: string) => GENERIC.test(t.trim());

/**
 * Navigation and footer links that survive the DOM cleanup show up on most
 * pages of a locale. Drop any href present on at least `ratio` of the pages
 * (minimum 3). Phone and e-mail links are support channels and always kept.
 */
export function removeBoilerplateLinks<T extends { locale: string; links: Link[] }>(
  pages: T[],
  ratio = 0.3,
): Set<string> {
  const dropped = new Set<string>();
  const byLocale = new Map<string, T[]>();
  for (const p of pages) byLocale.set(p.locale, [...(byLocale.get(p.locale) ?? []), p]);
  for (const group of byLocale.values()) {
    const df = new Map<string, number>();
    for (const p of group) for (const h of new Set(p.links.map((l) => l.href))) df.set(h, (df.get(h) ?? 0) + 1);
    const limit = Math.max(3, Math.ceil(group.length * ratio));
    for (const [h, n] of df) if (n >= limit && !/^(tel|mailto):/.test(h)) dropped.add(`${group[0].locale}\n${h}`);
  }
  return dropped;
}

export const isBoilerplateLink = (dropped: Set<string>, locale: string, href: string) => dropped.has(`${locale}\n${href}`);

/** Phone and e-mail links are attached to every chunk that mentions the number or address. */
export function mentionsContact(text: string, link: Link): boolean {
  if (link.kind === "phone") {
    const digits = link.href.slice(4).replace(/\D/g, "").replace(/^(0020|20)(?=\d{9,})/, "");
    if (digits.length < 3) return false;
    const re = new RegExp(`(?<!\\d)(?:\\+?20[\\s-]?)?${digits.split("").join("[\\s-]?")}(?!\\d)`);
    return re.test(toWesternDigits(text));
  }
  if (link.kind === "email") return text.toLowerCase().includes(link.href.slice(7));
  return false;
}

/**
 * E-mail addresses on the bank's own domain written in plain text (the complaints
 * page lists them without a mailto: anchor) become mailto: links. Other addresses
 * are personal data and are never turned into links.
 */
export function textContactLinks(text: string): Link[] {
  const out: Link[] = [];
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*aaib\.com\b/g)) {
    const l = safeLink({ text: m[0], href: `mailto:${m[0].toLowerCase()}`, kind: "email" });
    if (l) out.push(l);
  }
  return dedupeLinks(out);
}
