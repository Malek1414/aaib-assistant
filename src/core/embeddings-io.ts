import { dequantize } from "./dense.ts";
import type { Chunk, EmbeddingIndex } from "./types.ts";

/** The text that is embedded for a chunk: page label, heading trail, body. */
export const passageText = (c: Chunk) => `${c.title} | ${c.headingPath.join(" > ")}\n${c.text}`;

export interface EmbeddingMeta {
  model: string;
  dim: number;
  count: number;
  scale: number;
  indexVersion: string;
}

export function decodeEmbeddings(meta: EmbeddingMeta, bytes: ArrayBuffer): EmbeddingIndex {
  const data = new Int8Array(bytes);
  if (data.length !== meta.count * meta.dim) throw new Error("embedding file size does not match its metadata");
  return { model: meta.model, dim: meta.dim, vectors: dequantize(data, meta.scale, meta.dim) };
}
