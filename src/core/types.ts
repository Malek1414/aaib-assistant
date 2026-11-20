import type { Lang } from "./text.ts";

/** What a link leads to. Drives the label/icon in the "Useful links" list. */
export type LinkKind = "page" | "pdf" | "form" | "phone" | "email" | "app_store" | "external";

/** A link extracted from a source page at ingestion time (never typed by hand). */
export interface Link {
  /** Anchor text after the injection and PII filters. */
  text: string;
  /** Live URL (https://www.aaib.com/..., an external site, tel: or mailto:), never an archive wrapper. */
  href: string;
  kind: LinkKind;
}

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
  /** Links found inside this chunk's section of the page (deduped, boilerplate removed). */
  links?: Link[];
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
  /** Links of the cited chunk, used to build the "Useful links" list. */
  links?: Link[];
}

export interface Retrieved {
  chunk: Chunk;
  score: number;
  features: Record<string, number>;
}
