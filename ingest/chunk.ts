import { createHash } from "node:crypto";
import type { Chunk } from "../src/core/types.ts";
import type { Block } from "./extract.ts";
import type { Lang } from "../src/core/text.ts";

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
  const sections: { path: string[]; lines: string[] }[] = [];
  const trail: { level: number; text: string }[] = [];
  let current: { path: string[]; lines: string[] } | null = null;
  for (const b of blocks) {
    if (b.kind === "heading") {
      const level = b.level ?? 2;
      while (trail.length && trail[trail.length - 1].level >= level) trail.pop();
      trail.push({ level, text: b.text });
      current = { path: trail.map((t) => t.text), lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { path: [], lines: [] };
      sections.push(current);
    }
    if (!isNoiseLine(b.text)) current.lines.push(b.text);
  }

  const chunks: Chunk[] = [];
  for (const s of sections) {
    if (!s.lines.length) continue;
    let buf: string[] = [];
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
      });
    };
    for (const line of s.lines) {
      if (buf.length && words(buf.join(" ")) + words(line) > opts.maxWords) {
        flush();
        buf = buf.slice(-opts.overlapLines);
        if (words(buf.join(" ")) + words(line) > opts.maxWords) buf = [];
      }
      buf.push(line);
    }
    flush();
  }
  // Drop near-empty fragments that carry no answerable content.
  return chunks.filter((c) => words(c.text) >= 4 || /\d/.test(c.text));
}
