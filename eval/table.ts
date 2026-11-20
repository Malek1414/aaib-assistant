/** Renders eval/results/*.json into the Markdown tables used in the README. Usage: npx tsx eval/table.ts */
import { readFile, writeFile } from "node:fs/promises";

type S = Record<string, number>;
const cols: [string, string][] = [
  ["hit@1", "hit@1"], ["hit@3", "hit@3"], ["hit@5", "hit@5"], ["mrr", "MRR"], ["citationAccuracy", "citation acc."],
  ["citationPrecision", "citation prec."], ["factRecall", "fact recall"], ["refusalCorrectness", "refusal correct."],
  ["falseRefusals", "false refusals"], ["numericGrounding", "numbers grounded"], ["retrieveP50ms", "retrieve p50 ms"], ["totalP95ms", "total p95 ms"],
];
const row = (name: string, s: S) => `| ${name} | ${cols.map(([k]) => s[k]).join(" | ")} |`;
const head = `| config | ${cols.map(([, h]) => h).join(" | ")} |\n|---|${cols.map(() => "---:").join("|")}|`;

const ex = JSON.parse(await readFile("eval/results/extractive-all.json", "utf8"));
let md = `Snapshot ${ex.snapshot}, index ${ex.indexVersion}, ${ex.chunks} chunks, ${ex.node}, generated ${ex.generatedAt}.\n`;
for (const split of ["test", "dev", "all", "en", "ar"]) {
  md += `\n#### Extractive provider, split: ${split}\n\n${head}\n`;
  for (const [name, r] of Object.entries(ex.results as Record<string, Record<string, S>>)) md += row(name, r[split]) + "\n";
}
try {
  const llm = JSON.parse(await readFile("eval/results/local-llm-all.json", "utf8"));
  const gHead = `| config | ${cols.map(([, h]) => h).join(" | ")} | stripped sentences | extractive fallbacks | generate p50 ms |\n|---|${cols.map(() => "---:").join("|")}|---:|---:|---:|`;
  md += `\n#### Generative provider (${llm.provider}), all questions\n\n${gHead}\n`;
  for (const [name, r] of Object.entries(llm.results as Record<string, Record<string, S>>)) {
    const a = r.all;
    md += row(name, a).replace(/ \|$/, ` | ${a.strippedSentences} | ${a.extractiveFallbacks} | ${a.generateP50ms} |`) + "\n";
  }
} catch {
  /* generative eval not run */
}
// Hand-written notes below the marker survive regeneration.
const MARKER = "<!-- notes: kept by eval/table.ts -->";
try {
  const prev = await readFile("eval/RESULTS.md", "utf8");
  const i = prev.indexOf(MARKER);
  if (i >= 0) md += "\n" + prev.slice(i);
} catch {
  /* first run */
}
await writeFile("eval/RESULTS.md", md);
console.log(md);
