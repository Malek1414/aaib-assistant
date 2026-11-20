/**
 * Pre-computes passage embeddings for every chunk (multilingual-e5-small, q8)
 * and ships them int8-quantised next to the index, so the browser only has to
 * embed the query.
 *
 * Usage: npx tsx ingest/embed.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { createTransformersEmbedder, EMBEDDING_DIM, quantize } from "../src/core/dense.ts";
import type { KnowledgeIndex } from "../src/core/types.ts";
import { passageText } from "../src/core/embeddings-io.ts";

async function main() {
  const index = JSON.parse(await readFile("public/data/index.json", "utf8")) as KnowledgeIndex;
  const embedder = await createTransformersEmbedder();
  const all = new Float32Array(index.chunks.length * EMBEDDING_DIM);
  const t0 = Date.now();
  const batch = 16;
  for (let i = 0; i < index.chunks.length; i += batch) {
    const slice = index.chunks.slice(i, i + batch);
    const vecs = await embedder.embed(slice.map(passageText), "passage");
    vecs.forEach((v, j) => all.set(v, (i + j) * EMBEDDING_DIM));
    process.stdout.write(`\r[embed] ${Math.min(i + batch, index.chunks.length)}/${index.chunks.length}`);
  }
  const { data, scale } = quantize(all);
  await writeFile("public/data/embeddings.bin", Buffer.from(data.buffer));
  const meta = { model: embedder.model, dim: EMBEDDING_DIM, count: index.chunks.length, scale, indexVersion: index.version, dtype: "int8" };
  await writeFile("public/data/embeddings.json", JSON.stringify(meta, null, 2) + "\n");
  console.log(`\n[embed] done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${data.byteLength} bytes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
