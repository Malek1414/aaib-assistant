import { buildMessages } from "./prompt.ts";
import type { AnswerProvider, GenerationRequest } from "./types.ts";

/**
 * Local Ollama provider for development (the original 2025 prototype ran on
 * Ollama). Talks to http://localhost:11434 by default; nothing leaves the machine.
 */
export class OllamaProvider implements AnswerProvider {
  readonly id = "ollama";
  readonly extractive = false;
  readonly label: string;

  constructor(
    private model = "qwen2.5:3b-instruct",
    private baseUrl = "http://localhost:11434",
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {
    this.label = `Ollama (${model}, local)`;
  }

  async *generate(req: GenerationRequest): AsyncIterable<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: buildMessages(req),
        stream: true,
        options: { temperature: 0, num_ctx: 4096 },
      }),
      signal: req.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { message?: { content?: string }; done?: boolean; error?: string };
        if (msg.error) throw new Error(msg.error);
        if (msg.message?.content) yield msg.message.content;
        if (msg.done) return;
      }
    }
  }
}
