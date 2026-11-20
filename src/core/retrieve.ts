import { Bm25Index } from "./bm25.ts";
import { denseSearch, type Embedder } from "./dense.ts";
import { detectLang, tokenize } from "./text.ts";
import type { Chunk, EmbeddingIndex, KnowledgeIndex, Retrieved } from "./types.ts";

export type RetrievalMode = "bm25" | "dense" | "hybrid";

export interface RetrieveOptions {
  mode: RetrievalMode;
  rerank: boolean;
  topK: number;
}

export const NUMERIC_INTENT =
  /\b(rate|rates|interest|return|fee|fees|charge|charges|cost|price|minimum|maximum|min|max|limit|how much|how many|amount|percent|tenor|years?|months?|commission)\b|(سعر|عائد|فائدة|فايدة|رسوم|مصاريف|عمولة|الحد|كم|مبلغ|نسبة|مدة)/i;

/** Reranker weights. Set on the dev split of the golden set only (see eval/README section in the root README). */
export const RERANK_WEIGHTS = {
  bm25: 0.3,
  coverage: 0.3,
  heading: 0.1,
  bigram: 0.1,
  lang: 0.1,
  numeric: 0.05,
  dense: 0.25,
};

export class Retriever {
  readonly chunks: Chunk[];
  private bm25: Bm25Index;
  private headingTerms: Set<string>[];
  private dense: { index: EmbeddingIndex; embedder: Embedder } | null = null;

  constructor(index: KnowledgeIndex) {
    this.chunks = index.chunks;
    const heading = (c: Chunk) => [c.title, ...c.headingPath].join(" ");
    this.bm25 = new Bm25Index(this.chunks.map((c) => ({ body: c.text, heading: heading(c) })));
    this.headingTerms = this.chunks.map((c) => new Set(tokenize(heading(c))));
  }

  enableDense(index: EmbeddingIndex, embedder: Embedder) {
    if (index.vectors.length !== index.dim * this.chunks.length) throw new Error("embedding/chunk count mismatch");
    this.dense = { index, embedder };
  }

  get denseReady() {
    return this.dense !== null;
  }

  idf(term: string) {
    return this.bm25.idf(term);
  }

  /**
   * Share of the query's IDF mass carried by terms that occur nowhere in the
   * corpus. "What is the rate on the crypto savings account?" matches
   * rate/savings/account well, but its most specific term is unknown, so the
   * question is about something the pages do not cover.
   */
  unknownTermShare(query: string): number {
    const terms = [...new Set(tokenize(query))];
    const total = terms.reduce((s, t) => s + this.bm25.idf(t), 0);
    if (!total) return 0;
    const unknown = terms.filter((t) => this.bm25.df(t) === 0 && t.length >= 4 && !/\d/.test(t));
    return unknown.reduce((s, t) => s + this.bm25.idf(t), 0) / total;
  }

  async retrieve(query: string, opts: RetrieveOptions = { mode: "bm25", rerank: true, topK: 5 }): Promise<Retrieved[]> {
    const qTerms = [...new Set(tokenize(query))];
    const lang = detectLang(query);
    const pool = 40;

    const bm = this.bm25.search(qTerms, pool);
    let dn: [number, number][] = [];
    const wantDense = opts.mode !== "bm25" && this.dense;
    if (wantDense) {
      const [qv] = await this.dense!.embedder.embed([query], "query");
      dn = denseSearch(qv, this.dense!.index.vectors, this.dense!.index.dim, pool);
    }

    // Candidate pool and first-stage score.
    const first = new Map<number, number>();
    const bmMap = new Map(bm);
    const dnMap = new Map(dn);
    if (opts.mode === "bm25" || !wantDense) bm.forEach(([i, s]) => first.set(i, s));
    else if (opts.mode === "dense") dn.forEach(([i, s]) => first.set(i, s));
    else {
      // Reciprocal Rank Fusion (k = 60).
      const rrf = (list: [number, number][]) =>
        list.forEach(([i], r) => first.set(i, (first.get(i) ?? 0) + 1 / (60 + r + 1)));
      rrf(bm);
      rrf(dn);
    }

    const maxBm = bm.length ? bm[0][1] : 1;
    const idfSum = qTerms.reduce((s, t) => s + this.bm25.idf(t), 0) || 1;
    const numericIntent = NUMERIC_INTENT.test(query);
    const results: Retrieved[] = [...first.entries()].map(([i, s]) => {
      const terms = this.bm25.docTerms[i];
      const coverage = qTerms.reduce((acc, t) => acc + (terms.has(t) ? this.bm25.idf(t) : 0), 0) / idfSum;
      const heading = qTerms.length ? qTerms.filter((t) => this.headingTerms[i].has(t)).length / qTerms.length : 0;
      const bigram = this.bigramScore(qTerms, i);
      const features: Record<string, number> = {
        first: s,
        bm25: (bmMap.get(i) ?? 0) / maxBm,
        coverage,
        heading,
        bigram,
        lang: this.chunks[i].locale === lang ? 1 : 0,
        numeric: numericIntent && /\d/.test(this.chunks[i].text) ? 1 : 0,
        dense: dnMap.get(i) ?? 0,
      };
      return { chunk: this.chunks[i], score: s, features };
    });

    if (opts.rerank) {
      const W = RERANK_WEIGHTS;
      for (const r of results) {
        const f = r.features;
        r.score =
          W.bm25 * f.bm25 + W.coverage * f.coverage + W.heading * f.heading + W.bigram * f.bigram +
          W.lang * f.lang + W.numeric * f.numeric + (wantDense ? W.dense * Math.max(0, (f.dense - 0.7) / 0.3) : 0);
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, opts.topK);
  }

  /** Share of adjacent query-term pairs that also appear adjacent (within 3 tokens) in the chunk. */
  private bigramScore(qTerms: string[], i: number): number {
    if (qTerms.length < 2) return 0;
    const toks = tokenize(this.chunks[i].text);
    const pos = new Map<string, number[]>();
    toks.forEach((t, p) => pos.set(t, [...(pos.get(t) ?? []), p]));
    let hits = 0;
    for (let k = 0; k < qTerms.length - 1; k++) {
      const a = pos.get(qTerms[k]);
      const b = pos.get(qTerms[k + 1]);
      if (a && b && a.some((x) => b.some((y) => Math.abs(y - x) <= 3))) hits++;
    }
    return hits / (qTerms.length - 1);
  }
}
