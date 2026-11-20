/** Dense retrieval: cosine similarity over pre-computed, L2-normalised chunk embeddings. */

export const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
export const EMBEDDING_DIM = 384;

export interface Embedder {
  readonly model: string;
  /** e5 models expect "query: " / "passage: " prefixes. */
  embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]>;
}

export function l2normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function denseSearch(query: Float32Array, matrix: Float32Array, dim: number, topK = 50): [number, number][] {
  const n = matrix.length / dim;
  const scores: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * dim;
    for (let j = 0; j < dim; j++) s += query[j] * matrix[off + j];
    scores.push([i, s]);
  }
  return scores.sort((a, b) => b[1] - a[1]).slice(0, topK);
}

/** Int8 quantisation for the shipped embedding file (4x smaller than float32). */
export function quantize(vectors: Float32Array): { data: Int8Array; scale: number } {
  let max = 0;
  for (const x of vectors) max = Math.max(max, Math.abs(x));
  const scale = max / 127 || 1;
  const data = new Int8Array(vectors.length);
  for (let i = 0; i < vectors.length; i++) data[i] = Math.round(vectors[i] / scale);
  return { data, scale };
}

export function dequantize(data: Int8Array, scale: number, dim: number): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] * scale;
  // Re-normalise each row to undo quantisation drift.
  for (let r = 0; r < data.length / dim; r++) {
    const row = l2normalize(out.subarray(r * dim, (r + 1) * dim));
    out.set(row, r * dim);
  }
  return out;
}

/** transformers.js embedder; works in the browser (WASM/WebGPU) and in Node (onnxruntime). */
export async function createTransformersEmbedder(
  opts: { onProgress?: (p: { status: string; progress?: number; file?: string }) => void } = {},
): Promise<Embedder> {
  const { pipeline } = await import("@huggingface/transformers");
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, {
    dtype: "q8",
    progress_callback: opts.onProgress as never,
  });
  return {
    model: EMBEDDING_MODEL,
    async embed(texts, kind) {
      const prefixed = texts.map((t) => `${kind}: ${t}`);
      const out = await extractor(prefixed, { pooling: "mean", normalize: true });
      const flat = out.data as Float32Array;
      const dim = out.dims[out.dims.length - 1];
      return texts.map((_, i) => flat.slice(i * dim, (i + 1) * dim));
    },
  };
}
