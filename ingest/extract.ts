import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { Link } from "../src/core/types.ts";
import { dedupeLinks, makeLink } from "./links.ts";

export interface Block {
  /** "link" blocks carry links only (an icon link, a "Download" button); they add no text. */
  kind: "heading" | "text" | "row" | "link";
  level?: number;
  text: string;
  /** Links inside this block, already resolved to live URLs and vetted. */
  links?: Link[];
}

export interface Extracted {
  title: string;
  blocks: Block[];
  method: "html" | "rsc" | "searchify";
  /** tel: and mailto: links found anywhere on the page, header and footer included. */
  contacts?: Link[];
}

const LABEL_ATTR = "data-bsa-label";
const withLinks = (b: Block, links: Link[]): Block => (links.length ? { ...b, links: dedupeLinks(links) } : b);

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "dd", "div", "dl", "dt", "fieldset", "figure", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "label", "li", "main", "ol", "p", "section",
  "table", "tbody", "thead", "tr", "td", "th", "ul", "details", "summary",
]);

export const clean = (s: string) =>
  s
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "") // zero-width and bidi controls
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function isElement(n: AnyNode): n is Element {
  return n.type === "tag";
}

/** Linearise a table. Cells holding parallel lists (one <li> per tier) are zipped row-wise. */
function tableRows($: cheerio.CheerioAPI, table: Element): string[] {
  const headers = $(table)
    .find("thead th, thead td")
    .toArray()
    .map((h) => clean($(h).text()));
  const out: string[] = [];
  $(table)
    .find("tr")
    .toArray()
    .forEach((tr) => {
      const cells = $(tr).children("td,th").toArray();
      if (!cells.length || $(tr).parent("thead").length) return;
      const values = cells.map((c) => {
        const lis = $(c).find("li").toArray();
        return lis.length ? lis.map((l) => clean($(l).text())) : [clean($(c).text())];
      });
      const n = Math.max(...values.map((v) => v.length));
      for (let i = 0; i < n; i++) {
        const parts = values
          .map((v, j) => {
            const val = v.length === n ? v[i] : v[0];
            const key = headers[j] || $(cells[j]).attr("data-label") || "";
            return val ? (key ? `${key}: ${val}` : val) : "";
          })
          .filter(Boolean);
        if (parts.length) out.push(parts.join("; "));
      }
    });
  return out;
}

export function extractHtml(html: string, base = "https://www.aaib.com/"): Extracted {
  const $ = cheerio.load(html);
  const title = clean($("title").first().text());
  // Label every anchor before images and chrome are removed: icon and badge links
  // (app stores, PDFs) only carry their name in alt / aria-label / title.
  $("a[href]").each((_, a) => {
    const $a = $(a);
    // Card links wrap a title and a description: the title is the label.
    const head = $a.find("h1,h2,h3,h4,h5,h6,strong,b").first();
    const text = head.length ? clean(head.text()) : clean($a.text());
    const label = text || $a.attr("aria-label") || $a.attr("title") || $a.find("img[alt]").first().attr("alt") || "";
    $a.attr(LABEL_ATTR, clean(label));
  });
  const linkOf = (a: Element): Link | null => makeLink($(a).attr("href") ?? "", $(a).attr(LABEL_ATTR) ?? "", base);
  const linksIn = (el: Element): Link[] => {
    const anchors = el.tagName.toLowerCase() === "a" ? [el] : $(el).find("a[href]").toArray();
    return anchors.map(linkOf).filter((l): l is Link => !!l);
  };
  $("script,style,noscript,svg,img,iframe,input,button,select,template,nav,footer").remove();
  // Site chrome: header blocks that carry the logo or navigation. Content headers (FAQ tabs) are kept.
  $("header").each((_, h) => {
    const t = clean($(h).text());
    if (/Exchange Rates|Online banking|الخدمات المصرفية|أسعار الصرف/.test(t) || t.length > 600) $(h).remove();
  });
  $("[aria-hidden='true'],[hidden],.sr-only").remove();

  const blocks: Block[] = [];
  // `inherited`: links of enclosing anchors that wrap whole blocks (card-style links).
  const walk = (el: Element, inherited: Link[]) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const t = clean($(el).text());
      const links = [...inherited, ...linksIn(el)];
      if (t) blocks.push(withLinks({ kind: "heading", level: Number(tag[1]), text: t }, links));
      else if (links.length) blocks.push(withLinks({ kind: "link", text: "" }, links));
      return;
    }
    if (tag === "table") {
      const rows = tableRows($, el);
      const links = [...inherited, ...linksIn(el)];
      rows.forEach((r, i) => blocks.push(i === 0 ? withLinks({ kind: "row", text: r }, links) : { kind: "row", text: r }));
      if (!rows.length && links.length) blocks.push(withLinks({ kind: "link", text: "" }, links));
      return;
    }
    const kids = el.children;
    const hasBlockChild = kids.some((k) => isElement(k) && BLOCK_TAGS.has(k.tagName.toLowerCase()));
    if (!hasBlockChild) {
      const t = clean($(el).text());
      const links = [...inherited, ...linksIn(el)];
      if (t) blocks.push(withLinks({ kind: "text", text: t }, links));
      else if (links.length) blocks.push(withLinks({ kind: "link", text: "" }, links));
      return;
    }
    const own = tag === "a" ? linksIn(el) : [];
    const pass = own.length ? [...inherited, ...own] : inherited;
    for (const k of kids) {
      if (isElement(k)) walk(k, pass);
      else if (k.type === "text") {
        const t = clean((k as unknown as { data: string }).data);
        if (t.length > 2) blocks.push(withLinks({ kind: "text", text: t }, pass));
      }
    }
  };
  const root = $("body").get(0);
  if (root) walk(root as Element, []);
  return { title, blocks: dedupeAdjacent(blocks), method: "html" };
}

/** Merge adjacent blocks with the same text (and adjacent link-only blocks); their links are combined. */
export function dedupeAdjacent(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && prev.text === b.text && (prev.kind === "link") === (b.kind === "link")) {
      if (b.links?.length) out[out.length - 1] = withLinks(prev, [...(prev.links ?? []), ...b.links]);
      continue;
    }
    out.push(b);
  }
  return out;
}

/**
 * Client-rendered (App Router) pages ship their content in the React Server
 * Components flight payload instead of HTML. Walk that tree and recover the
 * same heading/text blocks.
 */
export function extractRsc(html: string, base = "https://www.aaib.com/"): Extracted {
  const title = clean((html.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? "");
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return "";
    }
  });
  const flight = chunks.join("");
  const blocks: Block[] = [];
  const textOf = (node: unknown): string => {
    if (typeof node === "string") return node.startsWith("$") ? "" : node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) {
      if (node[0] === "$" && typeof node[1] === "string") return textOf((node[3] as { children?: unknown })?.children);
      return node.map(textOf).join(" ");
    }
    return "";
  };
  // Links of rendered elements only (an <a> or a Link component with an href prop).
  // The flight payload also ships the site-wide menu and translation dictionaries
  // with URLs in them; those are not page content and are not read.
  const hrefLinksIn = (node: unknown, out: Link[] = []): Link[] => {
    if (Array.isArray(node)) {
      if (node[0] === "$" && typeof node[1] === "string") {
        const props = (node[3] ?? {}) as { href?: unknown; children?: unknown; "aria-label"?: unknown };
        if (typeof props.href === "string" && node[1] !== "link") {
          const l = makeLink(props.href, clean(textOf(props.children)) || String(props["aria-label"] ?? ""), base);
          if (l) out.push(l);
        }
        hrefLinksIn(props.children, out);
      } else node.forEach((n) => hrefLinksIn(n, out));
    }
    return out;
  };
  const visit = (node: unknown, inherited: Link[]) => {
    if (Array.isArray(node)) {
      if (node[0] === "$" && typeof node[1] === "string") {
        const tag = node[1];
        const props = (node[3] ?? {}) as { children?: unknown; href?: unknown };
        if (/^h[1-6]$/.test(tag)) {
          const t = clean(textOf(props.children));
          if (t) blocks.push(withLinks({ kind: "heading", level: Number(tag[1]), text: t }, [...inherited, ...hrefLinksIn(node)]));
          return;
        }
        if (["p", "li", "td", "th", "label", "span", "dt", "dd"].includes(tag)) {
          const t = clean(textOf(props.children));
          if (t) {
            blocks.push(withLinks({ kind: "text", text: t }, [...inherited, ...hrefLinksIn(node)]));
            return;
          }
        }
        if (["nav", "footer", "header", "script", "style", "button"].includes(tag)) return;
        if (typeof props.href === "string" && tag !== "link") {
          const own = hrefLinksIn(node).slice(0, 1);
          const before = blocks.length;
          visit(props.children, [...inherited, ...own]);
          if (blocks.length === before && own.length) blocks.push(withLinks({ kind: "link", text: "" }, own));
          return;
        }
        visit(props.children, inherited);
        return;
      }
      node.forEach((n) => visit(n, inherited));
    } else if (node && typeof node === "object") {
      const c = (node as { children?: unknown }).children;
      if (c !== undefined) visit(c, inherited);
    }
  };
  for (const line of flight.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const payload = line.slice(idx + 1);
    if (!payload.startsWith("[") && !payload.startsWith("{")) continue;
    try {
      visit(JSON.parse(payload), []);
    } catch {
      /* not JSON (module refs etc.) */
    }
  }
  return { title, blocks: dedupeAdjacent(blocks), method: "rsc" };
}

export const textLength = (e: Extracted) => e.blocks.reduce((n, b) => n + b.text.length, 0);

/** tel: and mailto: hrefs anywhere in the raw page (header and footer included). */
export function contactLinks(html: string, base: string): Link[] {
  const out: Link[] = [];
  for (const m of html.matchAll(/href\s*=\s*\\?["']((?:tel|mailto):[^"'\\<>]+)/gi)) {
    const l = makeLink(m[1], "", base);
    if (l) out.push(l);
  }
  return dedupeLinks(out);
}

export function extract(html: string, base = "https://www.aaib.com/"): Extracted {
  const contacts = contactLinks(html, base);
  const h = extractHtml(html, base);
  if (textLength(h) >= 400 || !html.includes("self.__next_f")) return { ...h, contacts };
  const r = extractRsc(html, base);
  return { ...(textLength(r) > textLength(h) ? r : h), contacts };
}

/**
 * Remove site-wide boilerplate: any block text that appears on at least
 * `ratio` of the pages of the same locale (menus, footers, hotline banners).
 */
export function removeBoilerplate<T extends { locale: string; extracted: Extracted }>(pages: T[], ratio = 0.3): void {
  const byLocale = new Map<string, T[]>();
  for (const p of pages) byLocale.set(p.locale, [...(byLocale.get(p.locale) ?? []), p]);
  for (const group of byLocale.values()) {
    const df = new Map<string, number>();
    for (const p of group)
      for (const t of new Set(p.extracted.blocks.filter((b) => b.kind !== "link").map((b) => b.text))) df.set(t, (df.get(t) ?? 0) + 1);
    const limit = Math.max(3, Math.ceil(group.length * ratio));
    for (const p of group)
      p.extracted.blocks = p.extracted.blocks.flatMap((b): Block[] => {
        if (b.kind === "link" || (df.get(b.text) ?? 0) < limit) return [b];
        // Repeated text ("Download", "Learn more") is boilerplate, but the link behind it
        // can still be page-specific. Keep the link; link-level boilerplate is removed by href.
        return b.links?.length ? [{ kind: "link", text: "", links: b.links }] : [];
      });
  }
}
