/**
 * Evaluation harness. Runs the golden set through the real assistant
 * pipeline under several retrieval configurations and reports:
 *   - retrieval hit@1/3/5 and MRR (answerable questions)
 *   - citation accuracy (answer-level and per-chip precision)
 *   - fact recall (expected figure or phrase present in the answer)
 *   - refusal correctness (should-refuse refused, should-answer answered)
 *   - numeric grounding (every number in an answer appears in a cited source)
 *   - latency p50/p95
 *
 * Usage: npx tsx eval/run-eval.ts [--split dev|test|all] [--configs bm25,bm25+rerank,...] [--provider extractive|ollama|local-llm]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Assistant, type AssistantResult } from "../src/core/assistant.ts";
import { createTransformersEmbedder } from "../src/core/dense.ts";
import { decodeEmbeddings, type EmbeddingMeta } from "../src/core/embeddings-io.ts";
import { ExtractiveProvider } from "../src/core/providers/extractive.ts";
import { OllamaProvider } from "../src/core/providers/ollama.ts";
import { TransformersLlmProvider } from "../src/core/providers/transformers-llm.ts";
import type { AnswerProvider } from "../src/core/providers/types.ts";
import { Retriever, type RetrievalMode } from "../src/core/retrieve.ts";
import { toWesternDigits } from "../src/core/text.ts";
import type { KnowledgeIndex } from "../src/core/types.ts";

interface GoldenItem {
  id: string;
  split: "dev" | "test";
  lang: "en" | "ar";
  category: string;
  expect: "answer" | "refuse";
  question: string;
  expectedUrls: string[];
  expectedFacts: string[];
}

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};

const CONFIGS: Record<string, { mode: RetrievalMode; rerank: boolean }> = {
  bm25: { mode: "bm25", rerank: false },
  "bm25+rerank": { mode: "bm25", rerank: true },
  dense: { mode: "dense", rerank: false },
  hybrid: { mode: "hybrid", rerank: false },
  "hybrid+rerank": { mode: "hybrid", rerank: true },
};

const norm = (s: string) => toWesternDigits(s).toLowerCase().replace(/\s+/g, " ");
const pct = (x: number) => Math.round(x * 1000) / 10;
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** Golden-set self-check: each expected fact must exist in a chunk of one of its expected URLs. */
function validateGolden(items: GoldenItem[], index: KnowledgeIndex): string[] {
  const problems: string[] = [];
  for (const it of items.filter((i) => i.expect === "answer")) {
    const texts = index.chunks.filter((c) => it.expectedUrls.includes(c.url)).map((c) => norm(c.text));
    if (!texts.length) problems.push(`${it.id}: no chunks for expected URLs`);
    for (const f of it.expectedFacts) if (!texts.some((t) => t.includes(norm(f)))) problems.push(`${it.id}: fact "${f}" not in expected pages`);
  }
  return problems;
}

interface Row {
  id: string;
  split: string;
  lang: string;
  expect: string;
  refused: boolean;
  refusalReason?: string;
  rank: number | null;
  citedUrls: string[];
  citationOk: boolean | null;
  citationPrecision: number | null;
  factOk: boolean | null;
  grounded: boolean;
  removedSentences: number;
  usedFallback: boolean;
  generateMs: number;
  retrieveMs: number;
  totalMs: number;
  topUrl?: string;
  topScore?: number;
  coverage?: number;
}

function score(it: GoldenItem, r: AssistantResult): Row {
  const urls = r.retrieved.map((x) => x.chunk.url);
  const idx = urls.findIndex((u) => it.expectedUrls.includes(u));
  const answered = !r.refused;
  const cited = r.citations.map((c) => c.url);
  const correctChips = cited.filter((u) => it.expectedUrls.includes(u)).length;
  return {
    id: it.id, split: it.split, lang: it.lang, expect: it.expect,
    refused: r.refused, refusalReason: r.refusalReason,
    rank: it.expect === "answer" ? (idx >= 0 ? idx + 1 : null) : null,
    citedUrls: cited,
    citationOk: it.expect === "answer" && answered ? correctChips > 0 : null,
    citationPrecision: it.expect === "answer" && answered && cited.length ? correctChips / cited.length : null,
    factOk: it.expect === "answer" && answered && it.expectedFacts.length ? it.expectedFacts.every((f) => norm(r.answer).includes(norm(f))) : null,
    grounded: r.grounding.grounded,
    removedSentences: r.removedSentences.length,
    usedFallback: r.usedFallback,
    generateMs: r.timings.generateMs,
    retrieveMs: r.timings.retrieveMs,
    totalMs: r.timings.totalMs,
    topUrl: r.retrieved[0]?.chunk.url,
    topScore: r.retrieved[0]?.score,
    coverage: r.retrieved[0]?.features.coverage,
  };
}

function summarise(rows: Row[]) {
  const ans = rows.filter((r) => r.expect === "answer");
  const ref = rows.filter((r) => r.expect === "refuse");
  const answered = ans.filter((r) => !r.refused);
  const hit = (k: number) => ans.filter((r) => r.rank !== null && r.rank <= k).length / (ans.length || 1);
  const withFacts = answered.filter((r) => r.factOk !== null);
  const precisions = answered.map((r) => r.citationPrecision).filter((x): x is number => x !== null);
  return {
    n: rows.length,
    answerable: ans.length,
    shouldRefuse: ref.length,
    "hit@1": pct(hit(1)),
    "hit@3": pct(hit(3)),
    "hit@5": pct(hit(5)),
    mrr: Math.round((ans.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / (ans.length || 1)) * 1000) / 1000,
    answeredRate: pct(answered.length / (ans.length || 1)),
    citationAccuracy: pct(answered.filter((r) => r.citationOk).length / (answered.length || 1)),
    citationPrecision: pct(precisions.reduce((a, b) => a + b, 0) / (precisions.length || 1)),
    factRecall: pct(withFacts.filter((r) => r.factOk).length / (withFacts.length || 1)),
    factRecallN: withFacts.length,
    refusalCorrectness: pct(rows.filter((r) => (r.expect === "refuse") === r.refused).length / (rows.length || 1)),
    correctRefusals: pct(ref.filter((r) => r.refused).length / (ref.length || 1)),
    falseRefusals: pct(ans.filter((r) => r.refused).length / (ans.length || 1)),
    numericGrounding: pct(rows.filter((r) => !r.refused).filter((r) => r.grounded).length / (rows.filter((r) => !r.refused).length || 1)),
    answersWithStrippedSentences: rows.filter((r) => r.removedSentences > 0).length,
    strippedSentences: rows.reduce((s, r) => s + r.removedSentences, 0),
    extractiveFallbacks: rows.filter((r) => !r.refused && r.usedFallback).length,
    generateP50ms: Math.round(quantile(rows.filter((r) => !r.refused).map((r) => r.generateMs), 0.5)),
    retrieveP50ms: Math.round(quantile(rows.map((r) => r.retrieveMs), 0.5) * 100) / 100,
    retrieveP95ms: Math.round(quantile(rows.map((r) => r.retrieveMs), 0.95) * 100) / 100,
    totalP50ms: Math.round(quantile(rows.map((r) => r.totalMs), 0.5) * 100) / 100,
    totalP95ms: Math.round(quantile(rows.map((r) => r.totalMs), 0.95) * 100) / 100,
  };
}

async function main() {
  const split = arg("--split", "all");
  const configNames = arg("--configs", Object.keys(CONFIGS).join(",")).split(",");
  const providerId = arg("--provider", "extractive");
  const golden = JSON.parse(await readFile("eval/golden.json", "utf8")) as { items: GoldenItem[] };
  const index = JSON.parse(await readFile("public/data/index.json", "utf8")) as KnowledgeIndex;

  const problems = validateGolden(golden.items, index);
  if (problems.length) {
    console.error("Golden set does not match the snapshot:\n  " + problems.join("\n  "));
    process.exit(2);
  }
  const items = golden.items.filter((i) => split === "all" || i.split === split);

  const retriever = new Retriever(index);
  if (configNames.some((c) => CONFIGS[c].mode !== "bm25")) {
    const meta = JSON.parse(await readFile("public/data/embeddings.json", "utf8")) as EmbeddingMeta;
    const bytes = await readFile("public/data/embeddings.bin");
    retriever.enableDense(decodeEmbeddings(meta, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), await createTransformersEmbedder());
    await retriever.retrieve("warm up", { mode: "dense", rerank: false, topK: 1 });
  }
  const provider: AnswerProvider =
    providerId === "ollama" ? new OllamaProvider(arg("--model", "qwen2.5:3b-instruct")) :
    providerId === "local-llm" ? new TransformersLlmProvider() : new ExtractiveProvider();
  const assistant = new Assistant(retriever, provider);

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    snapshot: index.snapshot,
    indexVersion: index.version,
    chunks: index.chunks.length,
    provider: provider.id,
    split,
    node: process.version,
    results: {} as Record<string, unknown>,
  };
  const perQuestion: Record<string, Row[]> = {};
  for (const name of configNames) {
    const rows: Row[] = [];
    for (const it of items) {
      const r = await assistant.ask(it.question, { retrieval: { ...CONFIGS[name], topK: 6 } });
      rows.push(score(it, r));
    }
    perQuestion[name] = rows;
    const all = summarise(rows);
    (report.results as Record<string, unknown>)[name] = {
      all,
      en: summarise(rows.filter((r) => r.lang === "en")),
      ar: summarise(rows.filter((r) => r.lang === "ar")),
      dev: summarise(rows.filter((r) => r.split === "dev")),
      test: summarise(rows.filter((r) => r.split === "test")),
    };
    console.log(`\n== ${name} (${provider.id}, split=${split}) ==`);
    console.log(JSON.stringify(all));
  }
  await mkdir("eval/results", { recursive: true });
  const tag = `${provider.id}-${split}`;
  await writeFile(`eval/results/${tag}.json`, JSON.stringify(report, null, 2) + "\n");
  await writeFile(`eval/results/${tag}.per-question.json`, JSON.stringify(perQuestion, null, 2) + "\n");
  console.log(`\nwrote eval/results/${tag}.json`);
  if (process.argv.includes("--failures")) {
    for (const [name, rows] of Object.entries(perQuestion)) {
      const bad = rows.filter((r) => (r.expect === "refuse") !== r.refused || r.citationOk === false || r.factOk === false || (r.expect === "answer" && r.rank !== 1));
      console.log(`\n-- ${name} failures/misses (${bad.length})`);
      for (const r of bad) {
        const q = items.find((i) => i.id === r.id)!.question;
        console.log(`${r.id} [${r.expect}] refused=${r.refused}${r.refusalReason ? "(" + r.refusalReason + ")" : ""} rank=${r.rank} cite=${r.citationOk} fact=${r.factOk} top=${r.topUrl?.replace("https://www.aaib.com", "")} s=${r.topScore?.toFixed(3)} cov=${r.coverage?.toFixed(2)} | ${q}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
