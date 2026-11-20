import { Assistant } from "../core/assistant.ts";
import { createTransformersEmbedder } from "../core/dense.ts";
import { decodeEmbeddings, type EmbeddingMeta } from "../core/embeddings-io.ts";
import { ExtractiveProvider } from "../core/providers/extractive.ts";
import { OllamaProvider } from "../core/providers/ollama.ts";
import { TransformersLlmProvider } from "../core/providers/transformers-llm.ts";
import type { AnswerProvider } from "../core/providers/types.ts";
import { Retriever } from "../core/retrieve.ts";
import type { KnowledgeIndex } from "../core/types.ts";

export type EngineId = "extractive" | "local-llm" | "ollama";
export type Progress = (msg: string) => void;

const base = import.meta.env.BASE_URL;

/** Owns the knowledge index, the retriever and the active answer provider. */
export class Engine {
  index!: KnowledgeIndex;
  retriever!: Retriever;
  assistant!: Assistant;
  private providers = new Map<EngineId, AnswerProvider>();
  private denseLoading: Promise<void> | null = null;

  async init() {
    const res = await fetch(`${base}data/index.json`);
    if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
    this.index = (await res.json()) as KnowledgeIndex;
    this.retriever = new Retriever(this.index);
    const extractive = new ExtractiveProvider(12);
    this.providers.set("extractive", extractive);
    this.assistant = new Assistant(this.retriever, extractive);
  }

  /** Lazily downloads the query embedder (once) and the pre-computed chunk vectors. */
  enableHybrid(progress: Progress): Promise<void> {
    if (!this.denseLoading) {
      this.denseLoading = (async () => {
        const [meta, bin] = await Promise.all([
          fetch(`${base}data/embeddings.json`).then((r) => r.json() as Promise<EmbeddingMeta>),
          fetch(`${base}data/embeddings.bin`).then((r) => r.arrayBuffer()),
        ]);
        const embedder = await createTransformersEmbedder({ onProgress: progressReporter("embeddings", progress) });
        this.retriever.enableDense(decodeEmbeddings(meta, bin), embedder);
      })();
      this.denseLoading.catch(() => (this.denseLoading = null));
    }
    return this.denseLoading;
  }

  useProvider(id: EngineId, progress: Progress) {
    let p = this.providers.get(id);
    if (!p) {
      p = id === "ollama" ? new OllamaProvider() : new TransformersLlmProvider(undefined, progressReporter("model", progress));
      this.providers.set(id, p);
    }
    this.assistant.provider = p;
  }
}

function progressReporter(label: string, progress: Progress) {
  const files = new Map<string, number>();
  return (p: { status: string; progress?: number; file?: string }) => {
    if (p.status === "progress" && p.file) {
      files.set(p.file, p.progress ?? 0);
      const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size;
      progress(`Downloading ${label}: ${Math.round(avg)}%`);
    } else if (p.status === "ready") progress(`${label} ready`);
  };
}
