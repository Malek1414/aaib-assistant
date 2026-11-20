import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export interface Block {
  kind: "heading" | "text" | "row";
  level?: number;
  text: string;
}

export interface Extracted {
  title: string;
  blocks: Block[];
  method: "html" | "rsc";
}

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

export function extractHtml(html: string): Extracted {
  const $ = cheerio.load(html);
  const title = clean($("title").first().text());
  $("script,style,noscript,svg,img,iframe,input,button,select,template,nav,footer").remove();
  // Site chrome: header blocks that carry the logo or navigation. Content headers (FAQ tabs) are kept.
  $("header").each((_, h) => {
    const t = clean($(h).text());
    if (/Exchange Rates|Online banking|الخدمات المصرفية|أسعار الصرف/.test(t) || t.length > 600) $(h).remove();
  });
  $("[aria-hidden='true'],[hidden],.sr-only").remove();

  const blocks: Block[] = [];
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const t = clean($(el).text());
      if (t) blocks.push({ kind: "heading", level: Number(tag[1]), text: t });
      return;
    }
    if (tag === "table") {
      for (const r of tableRows($, el)) blocks.push({ kind: "row", text: r });
      return;
    }
    const kids = el.children;
    const hasBlockChild = kids.some((k) => isElement(k) && BLOCK_TAGS.has(k.tagName.toLowerCase()));
    if (!hasBlockChild) {
      const t = clean($(el).text());
      if (t) blocks.push({ kind: "text", text: t });
      return;
    }
    for (const k of kids) {
      if (isElement(k)) walk(k);
      else if (k.type === "text") {
        const t = clean((k as unknown as { data: string }).data);
        if (t.length > 2) blocks.push({ kind: "text", text: t });
      }
    }
  };
  const root = $("body").get(0);
  if (root) walk(root as Element);
  return { title, blocks: dedupeAdjacent(blocks), method: "html" };
}

function dedupeAdjacent(blocks: Block[]): Block[] {
  return blocks.filter((b, i) => i === 0 || b.text !== blocks[i - 1].text);
}

/**
 * Client-rendered (App Router) pages ship their content in the React Server
 * Components flight payload instead of HTML. Walk that tree and recover the
 * same heading/text blocks.
 */
export function extractRsc(html: string): Extracted {
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
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      if (node[0] === "$" && typeof node[1] === "string") {
        const tag = node[1];
        const props = (node[3] ?? {}) as { children?: unknown };
        if (/^h[1-6]$/.test(tag)) {
          const t = clean(textOf(props.children));
          if (t) blocks.push({ kind: "heading", level: Number(tag[1]), text: t });
          return;
        }
        if (["p", "li", "td", "th", "label", "span", "dt", "dd"].includes(tag)) {
          const t = clean(textOf(props.children));
          if (t) {
            blocks.push({ kind: "text", text: t });
            return;
          }
        }
        if (["nav", "footer", "header", "script", "style", "button"].includes(tag)) return;
        visit(props.children);
        return;
      }
      node.forEach(visit);
    } else if (node && typeof node === "object") {
      const c = (node as { children?: unknown }).children;
      if (c !== undefined) visit(c);
    }
  };
  for (const line of flight.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const payload = line.slice(idx + 1);
    if (!payload.startsWith("[") && !payload.startsWith("{")) continue;
    try {
      visit(JSON.parse(payload));
    } catch {
      /* not JSON (module refs etc.) */
    }
  }
  return { title, blocks: dedupeAdjacent(blocks), method: "rsc" };
}

export const textLength = (e: Extracted) => e.blocks.reduce((n, b) => n + b.text.length, 0);

export function extract(html: string): Extracted {
  const h = extractHtml(html);
  if (textLength(h) >= 400 || !html.includes("self.__next_f")) return h;
  const r = extractRsc(html);
  return textLength(r) > textLength(h) ? r : h;
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
    for (const p of group) for (const t of new Set(p.extracted.blocks.map((b) => b.text))) df.set(t, (df.get(t) ?? 0) + 1);
    const limit = Math.max(3, Math.ceil(group.length * ratio));
    for (const p of group) p.extracted.blocks = p.extracted.blocks.filter((b) => (df.get(b.text) ?? 0) < limit);
  }
}
