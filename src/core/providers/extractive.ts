import type { AnswerProvider, GenerationRequest } from "./types.ts";

/**
 * Default provider: no model at all. Streams the verbatim extractive answer in
 * small pieces so the UI behaves the same as with a generative provider.
 */
export class ExtractiveProvider implements AnswerProvider {
  readonly id = "extractive";
  readonly label = "Extractive (no model, instant)";
  readonly extractive = true;

  constructor(private delayMs = 0) {}

  async *generate(req: GenerationRequest): AsyncIterable<string> {
    const pieces = req.extractiveDraft.match(/\S+\s*/g) ?? [];
    for (const p of pieces) {
      if (req.signal?.aborted) return;
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      yield p;
    }
  }
}
