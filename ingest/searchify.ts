/**
 * Searchify integration (the owner's page extractor, Python, local only).
 *
 * The raw archived HTML is piped to `ingest/searchify/bridge.py`, which runs
 * Searchify's local reader (`reader_document`: trafilatura with favor_recall +
 * resiliparse, full-page fallback for teaser pages) with every socket disabled.
 * No URL is fetched, no search backend or cloud fallback is reachable, and no
 * API key is read. Setup:
 *
 *   python3.12 -m venv ingest/.venv
 *   ingest/.venv/bin/pip install -e /path/to/searchify
 *
 * Two ways to use the result (`--extractor` in run.ts):
 *   - "searchify": Searchify's Markdown becomes the page blocks (headings,
 *     list items, table rows) and its inline Markdown links become the links.
 *   - "gate": Searchify decides what the main content is; the structured
 *     extractor (zipped rate tables, RSC payload) supplies the blocks, and a
 *     block is kept only if Searchify's main text contains it.
 * Client-rendered pages, where Searchify finds no text in the static HTML,
 * fall back to the structured extractor in both modes.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Link } from "../src/core/types.ts";
import { clean, dedupeAdjacent, type Block } from "./extract.ts";
import { makeLink } from "./links.ts";

export interface SearchifyDoc {
  id: string;
  title: string | null;
  content: string;
  error?: string;
}

export const SEARCHIFY_PYTHON = process.env.SEARCHIFY_PYTHON ?? join("ingest", ".venv", "bin", "python");
const BRIDGE = join("ingest", "searchify", "bridge.py");

/** Run Searchify's reader over raw HTML, all pages in one Python process. */
export async function searchifyBatch(items: { id: string; url: string; html: string }[]): Promise<Map<string, SearchifyDoc>> {
  if (!existsSync(SEARCHIFY_PYTHON)) {
    throw new Error(`Searchify venv not found at ${SEARCHIFY_PYTHON}. See ingest/searchify.ts for the two-line setup, or use --extractor legacy.`);
  }
  const child = spawn(SEARCHIFY_PYTHON, ["-I", "-W", "ignore", BRIDGE], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
  child.stderr.setEncoding("utf8").on("data", (d: string) => (err += d));
  const done = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  for (const it of items) child.stdin.write(JSON.stringify(it) + "\n");
  child.stdin.end();
  const code = await done;
  if (code !== 0) throw new Error(`Searchify bridge exited with ${code}: ${err.slice(-2000)}`);
  const docs = new Map<string, SearchifyDoc>();
  for (const line of out.split("\n")) if (line.trim()) {
    const d = JSON.parse(line) as SearchifyDoc;
    docs.set(d.id, d);
  }
  return docs;
}

const MD_LINK = /\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g;

/** Plain text of a Markdown line: links reduced to their text, emphasis and escapes removed. */
export function stripMarkdown(s: string): string {
  return clean(
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(MD_LINK, "$1")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1"),
  );
}

function mdLinks(line: string, base: string): Link[] {
  const out: Link[] = [];
  for (const m of line.matchAll(MD_LINK)) {
    const l = makeLink(m[2], stripMarkdown(m[1]), base);
    if (l) out.push(l);
  }
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Searchify Markdown -> the heading/text/row blocks the chunker expects. */
export function markdownToBlocks(md: string, base: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const text = stripMarkdown(h[2]);
      const links = mdLinks(h[2], base);
      if (text) blocks.push({ kind: "heading", level: h[1].length, text, ...(links.length ? { links } : {}) });
      continue;
    }
    if (line.startsWith("|")) {
      const table: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) table.push(lines[i++].trim());
      i--;
      const sepAt = table.findIndex((r) => /^\|?\s*:?-{3,}/.test(r));
      const header = sepAt === 1 ? cells(table[0]).map(stripMarkdown) : [];
      const body = sepAt === 1 ? table.slice(2) : table.filter((_, j) => j !== sepAt);
      body.forEach((r, j) => {
        const vals = cells(r);
        const parts = vals
          .map((v, k) => {
            const t = stripMarkdown(v);
            return t ? (header[k] ? `${header[k]}: ${t}` : t) : "";
          })
          .filter(Boolean);
        const links = mdLinks(r, base);
        if (parts.length) blocks.push({ kind: "row", text: parts.join("; "), ...(j === 0 && links.length ? { links } : {}) });
      });
      continue;
    }
    const body = line.replace(/^>\s*/, "").replace(/^([-*+•]|\d+[.)])\s+/, "");
    const text = stripMarkdown(body);
    const links = mdLinks(body, base);
    if (text) blocks.push({ kind: "text", text, ...(links.length ? { links } : {}) });
    else if (links.length) blocks.push({ kind: "link", text: "", links });
  }
  return dedupeAdjacent(blocks);
}

const norm = (s: string) => stripMarkdown(s).toLowerCase().replace(/\s+/g, " ");
export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Gate mode: keep a structured block only if Searchify's main text contains it.
 * Table rows are kept (Searchify keeps tables, but flattens parallel-list cells,
 * so the zipped row text would not match verbatim). Link-only blocks are kept
 * and judged later by the href-level boilerplate filter.
 */
export function gateBlocks(blocks: Block[], searchifyContent: string): Block[] {
  const main = norm(searchifyContent);
  return blocks.filter((b) => b.kind === "row" || b.kind === "link" || main.includes(b.text.toLowerCase().replace(/\s+/g, " ")));
}

/** Searchify found too little to judge the page (client-rendered shell): use the structured extractor as is. */
export const searchifyTooThin = (doc: SearchifyDoc | undefined) => !doc || !!doc.error || wordCount(stripMarkdown(doc.content)) < 60;
