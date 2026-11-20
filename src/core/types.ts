import type { Lang } from "./text.ts";

export interface Chunk {
  id: string;
  /** Public page URL the chunk was taken from; every citation points here. */
  url: string;
  locale: Lang;
  title: string;
  /** Page title followed by the heading trail inside the page. */
  headingPath: string[];
  text: string;
  /** Wayback Machine capture used as the source of the snapshot. */
  archiveUrl: string;
  captured: string;
}

export interface KnowledgeIndex {
  version: string;
  snapshot: string;
  builtAt: string;
  source: string;
  chunks: Chunk[];
}

export interface EmbeddingIndex {
  model: string;
  dim: number;
  /** Row-major Float32 vectors, L2-normalised, one per chunk in index order. */
  vectors: Float32Array;
}

export interface Citation {
  n: number;
  url: string;
  title: string;
  section: string;
  chunkId: string;
  captured: string;
  archiveUrl: string;
}

export interface Retrieved {
  chunk: Chunk;
  score: number;
  features: Record<string, number>;
}
