import type { Lang } from "../text.ts";

export interface GenerationSource {
  n: number;
  title: string;
  url: string;
  text: string;
}

export interface GenerationRequest {
  query: string;
  lang: Lang;
  sources: GenerationSource[];
  /** Verbatim extractive answer; generative providers may use it as a fallback. */
  extractiveDraft: string;
  signal?: AbortSignal;
}

/**
 * Pluggable answer provider. Every provider streams text. Whatever it
 * produces then goes through the same numeric-grounding and citation checks
 * in the assistant pipeline.
 */
export interface AnswerProvider {
  readonly id: string;
  readonly label: string;
  /** True when the provider only copies source text (no model). */
  readonly extractive: boolean;
  generate(req: GenerationRequest): AsyncIterable<string>;
}
