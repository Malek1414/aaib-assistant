import { tokenize } from "./text.ts";

export interface Bm25Options {
  k1: number;
  b: number;
  /** How many times heading/title tokens are repeated into the document (field boost). */
  headingBoost: number;
}

export interface Bm25Doc {
  body: string;
  heading: string;
}

/** Okapi BM25 over an in-memory inverted index. Small enough to build in the browser at load. */
export class Bm25Index {
  private postings = new Map<string, { doc: number; tf: number }[]>();
  private docLen: number[] = [];
  private avgLen = 0;
  readonly n: number;
  readonly docTerms: Set<string>[] = [];

  constructor(docs: Bm25Doc[], private opts: Bm25Options = { k1: 1.2, b: 0.75, headingBoost: 2 }) {
    this.n = docs.length;
    docs.forEach((d, i) => {
      const head = tokenize(d.heading);
      const toks = [...tokenize(d.body)];
      for (let r = 0; r < opts.headingBoost; r++) toks.push(...head);
      this.docLen[i] = toks.length;
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.docTerms[i] = new Set(tf.keys());
      for (const [t, f] of tf) {
        let p = this.postings.get(t);
        if (!p) this.postings.set(t, (p = []));
        p.push({ doc: i, tf: f });
      }
    });
    this.avgLen = this.docLen.reduce((a, b) => a + b, 0) / Math.max(1, this.n);
  }

  df(term: string): number {
    return this.postings.get(term)?.length ?? 0;
  }

  idf(term: string): number {
    const df = this.postings.get(term)?.length ?? 0;
    return Math.log(1 + (this.n - df + 0.5) / (df + 0.5));
  }

  /** Returns [docIndex, score] pairs sorted by score, best first. */
  search(query: string | string[], topK = 50): [number, number][] {
    const terms = [...new Set(typeof query === "string" ? tokenize(query) : query)];
    const scores = new Map<number, number>();
    const { k1, b } = this.opts;
    for (const t of terms) {
      const p = this.postings.get(t);
      if (!p) continue;
      const idf = this.idf(t);
      for (const { doc, tf } of p) {
        const norm = tf + k1 * (1 - b + (b * this.docLen[doc]) / this.avgLen);
        scores.set(doc, (scores.get(doc) ?? 0) + (idf * (tf * (k1 + 1))) / norm);
      }
    }
    return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);
  }
}
