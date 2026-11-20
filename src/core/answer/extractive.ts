import { NUMERIC_INTENT } from "../retrieve.ts";
import { splitSentences, tokenize, type Lang } from "../text.ts";
import type { Retrieved } from "../types.ts";

export interface SourceRef {
  n: number;
  r: Retrieved;
}

export interface ExtractiveOptions {
  maxSentences: number;
  /** Extra sources are cited only if they score at least this share of the best one. */
  secondarySourceRatio: number;
  maxSources: number;
  /** Drop sentences scoring below this share of the best sentence. */
  minRelativeScore: number;
}

export const DEFAULT_EXTRACTIVE: ExtractiveOptions = { maxSentences: 3, secondarySourceRatio: 0.8, maxSources: 3, minRelativeScore: 0.5 };

export const isTableRow = (s: string) => /^[^;:]{1,80}: [^;]+(; [^;:]{1,80}: [^;]+)+$/.test(s);

/** Pick the sources that will be cited: best hit plus close runners-up from other sections. */
export function selectSources(results: Retrieved[], opts = DEFAULT_EXTRACTIVE): SourceRef[] {
  if (!results.length) return [];
  const best = results[0].score;
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (out.length >= opts.maxSources) break;
    if (out.length && r.score < best * opts.secondarySourceRatio) break;
    // Skip near-duplicate passages (the SME and Corporate pages share text).
    const key = r.chunk.text.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n: out.length + 1, r });
  }
  return out;
}

/**
 * Purely extractive answer: sentences and table rows are copied verbatim from
 * the cited chunks and tagged with their citation number. Nothing is
 * paraphrased, so every figure in the answer is a figure in a source.
 */
export function composeExtractive(
  query: string,
  sources: SourceRef[],
  idf: (t: string) => number,
  lang: Lang,
  opts = DEFAULT_EXTRACTIVE,
): { text: string; used: number[] } {
  const qTerms = new Set(tokenize(query));
  const numeric = NUMERIC_INTENT.test(query);
  type Cand = { n: number; pos: number; srcRank: number; text: string; score: number };
  const cands: Cand[] = [];
  sources.forEach(({ n, r }, srcRank) => {
    const sents = splitSentences(r.chunk.text);
    const headTerms = new Set(tokenize([r.chunk.title, ...r.chunk.headingPath].join(" ")));
    sents.forEach((s, pos) => {
      let score = 0;
      if (isTableRow(s)) {
        // Rows look like "Key: value; Key: value". Values decide relevance; column keys count half.
        const pairs = s.split("; ").map((p) => p.split(/:\s(.*)/s));
        const vals = new Set(tokenize(pairs.map((p) => p[1] ?? p[0]).join(" ")));
        const keys = new Set(tokenize(pairs.map((p) => (p[1] ? p[0] : "")).join(" ")));
        for (const t of qTerms) score += vals.has(t) ? idf(t) : keys.has(t) ? 0.5 * idf(t) : 0;
      } else {
        const toks = new Set(tokenize(s));
        for (const t of qTerms) if (toks.has(t)) score += idf(t);
      }
      // Section headings give context to every line below them (e.g. a rate table under "EGP Golden Saving Interest Rate").
      const lineToks = new Set(tokenize(s));
      for (const t of qTerms) if (headTerms.has(t) && !lineToks.has(t)) score += 0.6 * idf(t);
      if (numeric && /\d/.test(s)) score += 0.5;
      // FAQ layout: a matching question line is not an answer; it pulls in the answer line after it.
      if (/[?؟]\s*$/.test(s)) {
        const next = sents[pos + 1];
        if (score > 0 && next && !/[?؟]\s*$/.test(next)) {
          cands.push({ n, pos: pos + 1, srcRank, text: next, score: score - srcRank * 0.25 + 0.01 });
        }
        return;
      }
      cands.push({ n, pos, srcRank, text: s, score: score - srcRank * 0.25 });
    });
  });

  // A table answer needs its rows: allow more lines when the query asks for figures.
  const limit = numeric ? opts.maxSentences + 4 : opts.maxSentences;
  const picked = new Map<string, Cand>();
  const seenText = new Set<string>();
  const sorted = [...cands].sort((a, b) => b.score - a.score || a.srcRank - b.srcRank || a.pos - b.pos);
  const top = sorted[0]?.score ?? 0;
  for (const c of sorted) {
    // Keep only sentences close to the best one, so weak partial matches do not pad the answer.
    if (picked.size >= limit || c.score <= 0 || c.score < top * opts.minRelativeScore) break;
    const key = c.text.replace(/\s+/g, " ").trim();
    if (seenText.has(key)) continue;
    seenText.add(key);
    picked.set(`${c.n}:${c.pos}`, c);
  }
  // A picked line that ends with ":" introduces a list; bring the list items along (up to 4).
  for (const c of [...picked.values()]) {
    if (!/[:：]\s*$/.test(c.text)) continue;
    const src = sources.find((x) => x.n === c.n);
    if (!src) continue;
    const sents = splitSentences(src.r.chunk.text);
    for (let k = 1; k <= 4 && sents[c.pos + k] && !/[:：]\s*$/.test(sents[c.pos + k]); k++) {
      picked.set(`${c.n}:${c.pos + k}`, { ...c, pos: c.pos + k, text: sents[c.pos + k] });
    }
  }
  // Nothing matched lexically (e.g. dense-only hit): fall back to the lead lines of the top source.
  if (!picked.size && sources.length) {
    splitSentences(sources[0].r.chunk.text)
      .slice(0, 2)
      .forEach((text, pos) => picked.set(`1:${pos}`, { n: 1, pos, srcRank: 0, text, score: 0 }));
  }
  const ordered = [...picked.values()].sort((a, b) => a.srcRank - b.srcRank || a.pos - b.pos);
  const lead = lang === "ar" ? "هذا ما تذكره صفحات البنك العامة:" : "Here is what the bank's public pages say:";
  const lines = ordered.map((c) => `• ${c.text.replace(/^[•\-*]\s*/, "")} [${c.n}]`);
  return { text: [lead, ...lines].join("\n"), used: [...new Set(ordered.map((c) => c.n))] };
}
