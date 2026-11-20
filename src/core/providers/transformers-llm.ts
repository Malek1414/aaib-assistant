import { buildMessages } from "./prompt.ts";
import type { AnswerProvider, GenerationRequest } from "./types.ts";

export const LOCAL_LLM_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";

type Generator = (
  msgs: { role: string; content: string }[],
  opts: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Small instruction model run with transformers.js. In the browser it uses
 * WebGPU when available (WASM otherwise); in Node it uses onnxruntime. It is
 * free to run, needs no key, and the weights are cached after the first download.
 */
export class TransformersLlmProvider implements AnswerProvider {
  readonly id = "local-llm";
  readonly label = "Qwen2.5-0.5B in your browser (one-time download, ~500 MB)";
  readonly extractive = false;
  private gen: Promise<{ generator: Generator; TextStreamer: new (...a: never[]) => unknown; tokenizer: unknown }> | null = null;

  constructor(
    private model = LOCAL_LLM_MODEL,
    private onProgress?: (p: { status: string; progress?: number; file?: string }) => void,
  ) {}

  private load() {
    if (!this.gen) {
      this.gen = (async () => {
        const tf = await import("@huggingface/transformers");
        const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
        // q4f16 (483 MB) needs WebGPU; WASM and Node CPU use the int8 build (512 MB).
        const generator = (await tf.pipeline("text-generation", this.model, {
          dtype: hasWebGpu ? "q4f16" : "q8",
          device: hasWebGpu ? "webgpu" : undefined,
          progress_callback: this.onProgress as never,
        })) as unknown as Generator & { tokenizer: unknown };
        return { generator, TextStreamer: tf.TextStreamer as never, tokenizer: generator.tokenizer };
      })();
    }
    return this.gen;
  }

  async *generate(req: GenerationRequest): AsyncIterable<string> {
    const { generator, TextStreamer, tokenizer } = await this.load();
    const queue: string[] = [];
    let finished = false;
    let wake: (() => void) | null = null;
    const streamer = new (TextStreamer as unknown as new (t: unknown, o: object) => unknown)(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (t: string) => {
        queue.push(t);
        wake?.();
      },
    });
    const done = generator(buildMessages(req), { max_new_tokens: 220, do_sample: false, streamer }).finally(() => {
      finished = true;
      wake?.();
    });
    while (!finished || queue.length) {
      if (queue.length) yield queue.shift()!;
      else await new Promise<void>((r) => (wake = r));
      wake = null;
    }
    await done;
  }
}
