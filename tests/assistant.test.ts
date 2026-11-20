import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { checkNumbers } from "../src/core/answer/grounding.ts";
import { Assistant } from "../src/core/assistant.ts";
import { ExtractiveProvider } from "../src/core/providers/extractive.ts";
import type { AnswerProvider, GenerationRequest } from "../src/core/providers/types.ts";
import { Retriever } from "../src/core/retrieve.ts";
import type { KnowledgeIndex } from "../src/core/types.ts";

let retriever: Retriever;
beforeAll(() => {
  const index = JSON.parse(readFileSync("public/data/index.json", "utf8")) as KnowledgeIndex;
  retriever = new Retriever(index);
});

class ScriptedProvider implements AnswerProvider {
  readonly id = "scripted";
  readonly label = "scripted";
  readonly extractive = false;
  constructor(private reply: string | Error) {}
  async *generate(_req: GenerationRequest) {
    if (this.reply instanceof Error) throw this.reply;
    for (const w of this.reply.split(/(?<= )/)) yield w;
  }
}

describe("assistant pipeline on the real snapshot", () => {
  it("answers a rates question with a citation to the right page and only sourced numbers", async () => {
    const a = new Assistant(retriever, new ExtractiveProvider());
    const r = await a.ask("What is the minimum balance to open a Golden Saving Account?");
    expect(r.refused).toBe(false);
    expect(r.citations[0].url).toBe("https://www.aaib.com/en/individual/edge/accounts/golden-saving-account");
    expect(r.answer).toContain("20,000");
    expect(r.grounding.grounded).toBe(true);
  });

  it("answers in Arabic from Arabic pages", async () => {
    const r = await new Assistant(retriever, new ExtractiveProvider()).ask("ما هي المستندات المطلوبة لفتح حسابات للقصر؟");
    expect(r.lang).toBe("ar");
    expect(r.refused).toBe(false);
    expect(r.citations.every((c) => c.url.includes("/ar/"))).toBe(true);
  });

  it("refuses with a support handoff when the pages do not cover the question", async () => {
    const r = await new Assistant(retriever, new ExtractiveProvider()).ask("What is the interest rate on the crypto savings account?");
    expect(r.refused).toBe(true);
    expect(r.answer).toContain("I can't find that on AAIB's public pages");
    expect(r.answer).toContain("19555");
    expect(r.citations).toEqual([]);
  });

  it("redacts PII before anything else and hands account requests off", async () => {
    const r = await new Assistant(retriever, new ExtractiveProvider()).ask("my card 4111 1111 1111 1111 was stolen, block my card");
    expect(r.query).not.toContain("4111");
    expect(r.redactions[0].kind).toBe("CARD");
    expect(r.refusalReason).toBe("account-action");
  });

  it("removes sentences with invented figures from generative output", async () => {
    const a = new Assistant(retriever, new ScriptedProvider("The minimum balance is EGP 20,000 [1]. It also pays a 30% bonus [1]."));
    const r = await a.ask("What is the minimum balance to open a Golden Saving Account?");
    expect(r.removedSentences).toEqual(["It also pays a 30% bonus [1]."]);
    expect(r.answer).not.toContain("30%");
    expect(checkNumbers(r.answer.split("\n(")[0], r.retrieved.map((x) => x.chunk.text)).grounded).toBe(true);
  });

  it("falls back to the extractive answer when the model says it cannot answer or fails", async () => {
    for (const reply of ["NOT_IN_SOURCES", new Error("model crashed"), "No citation and a made-up 99% rate."]) {
      const r = await new Assistant(retriever, new ScriptedProvider(reply)).ask("What is the grace period on credit card purchases?");
      expect(r.usedFallback).toBe(true);
      expect(r.answer).toContain("55 days");
    }
  });

  it("streams guard, sources, tokens, then a final event", async () => {
    const types: string[] = [];
    for await (const ev of new Assistant(retriever, new ExtractiveProvider()).stream("What is QPay?")) types.push(ev.type);
    expect(types[0]).toBe("guard");
    expect(types[1]).toBe("sources");
    expect(types.filter((t) => t === "token").length).toBeGreaterThan(3);
    expect(types.at(-1)).toBe("final");
  });
});
