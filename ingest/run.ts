/**
 * Ingestion entry point:
 *   robots policy -> CDX discovery -> polite capture fetch -> extraction ->
 *   boilerplate removal -> injection quarantine -> chunking -> versioned snapshot.
 *
 * Usage: npx tsx ingest/run.ts [--snapshot 2026-11-20]
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectInjection } from "../src/core/guardrails/injection.ts";
import type { Chunk, KnowledgeIndex } from "../src/core/types.ts";
import { chunkPage } from "./chunk.ts";
import { discoverTargets, resolveRobots, type Target } from "./discover.ts";
import { extract, removeBoilerplate, textLength, type Extracted } from "./extract.ts";
import { fetchBestCapture, type LedgerEntry, type RawPage } from "./fetch-pages.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const snapshot = arg("--snapshot") ?? new Date().toISOString().slice(0, 10);
const outDir = join("data", "snapshots", snapshot);

const SECTION_LABELS: Record<string, string> = {
  individual: "Personal", "personal-banking": "Personal Banking", edge: "Edge", wealth: "Wealth",
  smes: "SMEs", corporate: "Corporate", "discover-more": "Discover more", faq: "FAQs", tariffs: "Tariffs",
  "customer-rights": "Customer rights", "contact-us": "Contact us", "you-matter": "You matter",
  "security-tips": "Security tips", "online-banking": "Online banking", deposites: "Deposits", deposits: "Deposits",
  "digital-services": "Digital services", accounts: "Accounts", cards: "Cards", lending: "Lending", trade: "Trade finance",
  treasury: "Treasury", collections: "Cash management", "global-transaction-banking": "Global transaction banking",
  "investments-finance": "Investment banking", packages: "Packages",
};
const humanise = (seg: string) =>
  SECTION_LABELS[seg] ?? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Page label built from the URL path, so EN and AR pages share stable, readable titles. */
export function pageLabel(path: string): string {
  return path.split("/").filter(Boolean).map(humanise).join(" / ") || "Home";
}

async function main() {
  const t0 = Date.now();
  const robots = await resolveRobots();
  console.log(`[robots] ${robots.source}: ${robots.note}`);
  const targets = await discoverTargets(robots);
  console.log(`[discover] ${targets.length} in-scope pages`);

  const ledger: LedgerEntry[] = [];
  const pages: (RawPage & { extracted: Extracted })[] = [];
  for (const t of targets) {
    let best: (RawPage & { extracted: Extracted }) | null = null;
    // Prefer the newest capture; if it is thin (client-rendered shell), look at up to two older ones.
    for (let i = 0; i < Math.min(3, t.captures.length); i++) {
      const single: Target = { ...t, captures: t.captures.slice(i, i + 1) };
      const { page, ledger: l } = await fetchBestCapture(single, 1);
      ledger.push(...l);
      if (!page) continue;
      const extracted = extract(page.html);
      if (!best || textLength(extracted) > textLength(best.extracted) * 1.2) best = { ...page, extracted };
      if (textLength(best.extracted) >= 800) break;
    }
    if (best) pages.push(best);
    process.stdout.write(".");
  }
  console.log(`\n[fetch] ${pages.length}/${targets.length} pages with a usable capture`);

  removeBoilerplate(pages);

  const quarantine: { url: string; text: string; hits: string[] }[] = [];
  for (const p of pages) {
    p.extracted.blocks = p.extracted.blocks.filter((b) => {
      const v = detectInjection(b.text);
      if (v.flagged) quarantine.push({ url: p.url, text: b.text.slice(0, 300), hits: v.hits });
      return !v.flagged;
    });
  }

  const chunks: Chunk[] = [];
  for (const p of pages) {
    const captured = `${p.captureTimestamp.slice(0, 4)}-${p.captureTimestamp.slice(4, 6)}-${p.captureTimestamp.slice(6, 8)}`;
    chunks.push(
      ...chunkPage(
        { url: p.url, locale: p.locale, title: pageLabel(p.path), archiveUrl: p.archiveUrl, captured },
        p.extracted.blocks,
      ),
    );
  }
  const seen = new Set<string>();
  const unique = chunks.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  await mkdir(outDir, { recursive: true });
  const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await writeFile(
    join(outDir, "pages.jsonl"),
    jsonl(
      pages.map((p) => ({
        url: p.url, locale: p.locale, path: p.path, title: pageLabel(p.path), htmlTitle: p.extracted.title,
        archiveUrl: p.archiveUrl, captureTimestamp: p.captureTimestamp, sha256: p.sha256, bytes: p.bytes,
        method: p.extracted.method, blocks: p.extracted.blocks,
      })),
    ),
  );
  await writeFile(join(outDir, "chunks.jsonl"), jsonl(unique));
  await writeFile(join(outDir, "crawl-ledger.jsonl"), jsonl(ledger));
  await writeFile(join(outDir, "quarantine.jsonl"), jsonl(quarantine));

  const index: KnowledgeIndex = {
    version: createHash("sha256").update(JSON.stringify(unique)).digest("hex").slice(0, 12),
    snapshot,
    builtAt: new Date().toISOString(),
    source: "Internet Archive captures of public www.aaib.com pages",
    chunks: unique,
  };
  const manifest = {
    snapshot,
    indexVersion: index.version,
    robots: { source: robots.source, note: robots.note },
    pages: pages.length,
    pagesByLocale: { en: pages.filter((p) => p.locale === "en").length, ar: pages.filter((p) => p.locale === "ar").length },
    extraction: { html: pages.filter((p) => p.extracted.method === "html").length, rsc: pages.filter((p) => p.extracted.method === "rsc").length },
    chunks: unique.length,
    chunksByLocale: { en: unique.filter((c) => c.locale === "en").length, ar: unique.filter((c) => c.locale === "ar").length },
    quarantinedBlocks: quarantine.length,
    requests: ledger.length,
    rejectedCaptures: ledger.filter((l) => l.status !== "ok").length,
    durationSec: Math.round((Date.now() - t0) / 1000),
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await mkdir(join("public", "data"), { recursive: true });
  await writeFile(join("public", "data", "index.json"), JSON.stringify(index));
  console.log("[snapshot]", JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
