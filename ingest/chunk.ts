import { createHash } from "node:crypto";
import type { Chunk, Link } from "../src/core/types.ts";
import type { Block } from "./extract.ts";
import type { Lang } from "../src/core/text.ts";
import { dedupeLinks } from "./links.ts";

/** At most this many links are kept per chunk (in page order). */
export const MAX_CHUNK_LINKS = 8;

export interface ChunkOptions {
  /** Soft cap on words per chunk. Rows and sentences are never split. */
  maxWords: number;
  /** Lines of overlap carried into the next chunk of the same section. */
  overlapLines: number;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Call-to-action and widget labels that carry no answerable content. */
const NOISE_LINE = /^(download|learn more|read more|apply now|know more|click here|تحميل|تعرف على المزيد|اعرف المزيد|المزيد|قدم الآن)$/i;
export const isNoiseLine = (s: string) => NOISE_LINE.test(s.trim()) || (s.trim().length < 2 && !/\d/.test(s));

/**
 * Heading-aware chunker. A new section starts at every heading; sections are
 * packed line by line up to `maxWords`, with a small overlap so a table header
 * row or lead sentence is not orphaned.
 */
export function chunkPage(
  page: { url: string; locale: Lang; title: string; archiveUrl: string; captured: string },
  blocks: Block[],
  opts: ChunkOptions = { maxWords: 160, overlapLines: 1 },
): Chunk[] {
  // A line is either text (with the links inside it) or links only: a link block,
  // or a call-to-action line like "Download" whose text is noise but whose PDF is not.
  type Line = { text: string | null; links: Link[] };
  const sections: { path: string[]; lines: Line[]; headingLinks: Link[] }[] = [];
  const trail: { level: number; text: string }[] = [];
  let current: { path: string[]; lines: Line[]; headingLinks: Link[] } | null = null;
  for (const b of blocks) {
    if (b.kind === "heading") {
      const level = b.level ?? 2;
      while (trail.length && trail[trail.length - 1].level >= level) trail.pop();
      trail.push({ level, text: b.text });
      current = { path: trail.map((t) => t.text), lines: [], headingLinks: b.links ?? [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { path: [], lines: [], headingLinks: [] };
      sections.push(current);
    }
    const text = b.kind === "link" || isNoiseLine(b.text) ? null : b.text;
    if (text !== null || b.links?.length) current.lines.push({ text, links: b.links ?? [] });
  }

  const chunks: Chunk[] = [];
  for (const s of sections) {
    if (!s.lines.some((l) => l.text !== null)) continue;
    let buf: string[] = [];
    let bufLinks: Link[] = [...s.headingLinks];
    let carry: Link[] = []; // links-only lines seen before the first text of the next chunk
    const flush = () => {
      if (!buf.length) return;
      const text = buf.join("\n");
      const id = createHash("sha1").update(page.url + "\n" + s.path.join(">") + "\n" + text).digest("hex").slice(0, 12);
      chunks.push({
        id,
        url: page.url,
        locale: page.locale,
        title: page.title,
        headingPath: s.path,
        text,
        archiveUrl: page.archiveUrl,
        captured: page.captured,
        links: dedupeLinks(bufLinks).slice(0, MAX_CHUNK_LINKS),
      });
    };
    for (const line of s.lines) {
      if (line.text === null) {
        // Links-only lines belong to the chunk being built (a "Download" under its table).
        if (buf.length) bufLinks.push(...line.links);
        else carry.push(...line.links);
        continue;
      }
      if (buf.length && words(buf.join(" ")) + words(line.text) > opts.maxWords) {
        flush();
        buf = buf.slice(-opts.overlapLines);
        bufLinks = [];
        if (words(buf.join(" ")) + words(line.text) > opts.maxWords) buf = [];
      }
      buf.push(line.text);
      bufLinks.push(...carry, ...line.links);
      carry = [];
    }
    if (carry.length) bufLinks.push(...carry);
    flush();
  }
  // Drop near-empty fragments that carry no answerable content.
  return chunks.filter((c) => words(c.text) >= 4 || /\d/.test(c.text));
}
