import { composeExtractive, selectSources, type SourceRef } from "./answer/extractive.ts";
import { checkNumbers, stripUngroundedSentences, type GroundingReport } from "./answer/grounding.ts";
import { redactPii, type Redaction } from "./guardrails/pii.ts";
import { classifyScope, hasBankingTerm, type ScopeVerdict } from "./guardrails/scope.ts";
import type { AnswerProvider } from "./providers/types.ts";
import type { Retriever, RetrieveOptions } from "./retrieve.ts";
import { detectLang, type Lang } from "./text.ts";
import type { Citation, Retrieved } from "./types.ts";

export type RefusalReason = "no-grounded-source" | "out-of-scope" | "account-action" | "advice" | "injection" | "empty";

export interface GateConfig {
  /** Minimum reranked score of the best chunk. */
  minScore: number;
  /** Minimum IDF-weighted share of query terms found in the best chunk. */
  minCoverage: number;
  /** Lower coverage bar when the query clearly mentions a banking term. */
  minCoverageBanking: number;
  /** Refuse when this share of the query's IDF mass is carried by terms absent from the corpus. */
  maxUnknownShare: number;
}

/** Thresholds chosen on the dev split of eval/golden.json (see README, "Evaluation"). */
export const DEFAULT_GATE: GateConfig = { minScore: 0.42, minCoverage: 0.6, minCoverageBanking: 0.4, maxUnknownShare: 0.3 };

export const SUPPORT = {
  phone: "19555",
  phoneIntl: "+202 19555",
  contactUrl: { en: "https://www.aaib.com/en/discover-more/customer-rights/contact-us", ar: "https://www.aaib.com/ar/discover-more/customer-rights/contact-us" },
};

const REFUSALS: Record<Lang, Record<RefusalReason, string>> = {
  en: {
    "no-grounded-source": "I can't find that on AAIB's public pages, so I won't guess.",
    "out-of-scope": "I can only answer questions about the bank's public products and services.",
    "account-action": "I can't see or change accounts, cards or transactions, and you should never share card or ID numbers in a chat.",
    advice: "I can't give personal financial or investment advice.",
    injection: "I can't follow that request. I only answer questions about the bank's public products and services.",
    empty: "Please type a question.",
  },
  ar: {
    "no-grounded-source": "لا أجد هذه المعلومة في صفحات AAIB العامة، ولن أخمّن.",
    "out-of-scope": "يمكنني فقط الإجابة عن أسئلة حول منتجات وخدمات البنك المنشورة للعامة.",
    "account-action": "لا يمكنني الاطلاع على الحسابات أو البطاقات أو المعاملات، ولا تشارك أبدًا رقم البطاقة أو الرقم القومي في المحادثة.",
    advice: "لا يمكنني تقديم نصائح مالية أو استثمارية شخصية.",
    injection: "لا يمكنني تنفيذ هذا الطلب. أجيب فقط عن أسئلة حول منتجات وخدمات البنك العامة.",
    empty: "من فضلك اكتب سؤالك.",
  },
};

export function handoffText(lang: Lang): string {
  return lang === "ar"
    ? `للمساعدة تواصل مع خدمة عملاء البنك على ${SUPPORT.phone} (من خارج مصر: ${SUPPORT.phoneIntl}) أو عبر صفحة التواصل الرسمية: ${SUPPORT.contactUrl.ar}`
    : `For help, contact the bank's customer service on ${SUPPORT.phone} (from outside Egypt: ${SUPPORT.phoneIntl}) or use the official contact page: ${SUPPORT.contactUrl.en}`;
}

export type AssistantEvent =
  | { type: "guard"; redactions: Redaction[]; redactedQuery: string; scope: ScopeVerdict; lang: Lang }
  | { type: "sources"; citations: Citation[] }
  | { type: "token"; text: string }
  | { type: "final"; result: AssistantResult };

export interface AssistantResult {
  query: string;
  lang: Lang;
  answer: string;
  refused: boolean;
  refusalReason?: RefusalReason;
  citations: Citation[];
  retrieved: Retrieved[];
  redactions: Redaction[];
  grounding: GroundingReport;
  removedSentences: string[];
  provider: string;
  usedFallback: boolean;
  timings: { retrieveMs: number; generateMs: number; totalMs: number };
}

export interface AskOptions {
  retrieval?: Partial<RetrieveOptions>;
  signal?: AbortSignal;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class Assistant {
  constructor(
    private retriever: Retriever,
    public provider: AnswerProvider,
    private gate: GateConfig = DEFAULT_GATE,
  ) {}

  async ask(query: string, opts: AskOptions = {}): Promise<AssistantResult> {
    let final: AssistantResult | undefined;
    for await (const ev of this.stream(query, opts)) if (ev.type === "final") final = ev.result;
    return final!;
  }

  async *stream(rawQuery: string, opts: AskOptions = {}): AsyncGenerator<AssistantEvent> {
    const t0 = now();
    const { text: query, redactions } = redactPii(rawQuery.trim());
    const lang = detectLang(query);
    const scope = classifyScope(query);
    yield { type: "guard", redactions, redactedQuery: query, scope, lang };

    const base = { query, lang, redactions, provider: this.provider.id, removedSentences: [], usedFallback: false };
    const refuse = (reason: RefusalReason, retrieved: Retrieved[] = [], tRetrieve = 0): AssistantResult => {
      const handoff = reason === "empty" ? "" : "\n" + handoffText(lang);
      const answer = REFUSALS[lang][reason] + handoff;
      return {
        ...base, answer, refused: true, refusalReason: reason, citations: [], retrieved,
        grounding: checkNumbers(answer, [handoffText(lang)]),
        timings: { retrieveMs: tRetrieve, generateMs: 0, totalMs: now() - t0 },
      };
    };

    if (!query.replace(/\[[A-Z_]+\]/g, "").trim()) {
      yield { type: "final", result: refuse("empty") };
      return;
    }
    if (scope.kind !== "in-scope") {
      yield { type: "final", result: refuse(scope.kind === "off-topic" ? "out-of-scope" : scope.kind) };
      return;
    }

    const tr0 = now();
    const retrieval: RetrieveOptions = { mode: "bm25", rerank: true, topK: 6, ...opts.retrieval };
    const retrieved = await this.retriever.retrieve(query, retrieval);
    const retrieveMs = now() - tr0;

    const best = retrieved[0];
    const banking = hasBankingTerm(query);
    const coverageBar = banking ? this.gate.minCoverageBanking : this.gate.minCoverage;
    const grounded =
      !!best &&
      best.features.coverage >= coverageBar &&
      this.retriever.unknownTermShare(query) < this.gate.maxUnknownShare &&
      (!retrieval.rerank || best.score >= this.gate.minScore);
    if (!grounded) {
      yield { type: "final", result: refuse(banking ? "no-grounded-source" : "out-of-scope", retrieved, retrieveMs) };
      return;
    }

    const sources = selectSources(retrieved);
    const draft = composeExtractive(query, sources, (t) => this.retriever.idf(t), lang);
    const used = sources.filter((s) => draft.used.includes(s.n));
    const citations = toCitations(this.provider.extractive ? (used.length ? used : sources.slice(0, 1)) : sources);
    yield { type: "sources", citations };

    const tg0 = now();
    let text = "";
    let usedFallback = false;
    try {
      for await (const piece of this.provider.generate({
        query, lang, extractiveDraft: draft.text, signal: opts.signal,
        sources: sources.map((s) => ({ n: s.n, title: s.r.chunk.title, url: s.r.chunk.url, text: s.r.chunk.text })),
      })) {
        text += piece;
        yield { type: "token", text: piece };
      }
    } catch {
      usedFallback = true;
      text = draft.text;
    }
    const generateMs = now() - tg0;

    const sourceTexts = sources.map((s) => s.r.chunk.text);
    let removed: string[] = [];
    if (!this.provider.extractive && !usedFallback) {
      if (/NOT_IN_SOURCES/.test(text) || !text.trim()) {
        usedFallback = true;
        text = draft.text;
      } else {
        const stripped = stripUngroundedSentences(text, sourceTexts);
        removed = stripped.removed;
        text = stripped.text;
        if (!text.trim() || !/\[\d\]/.test(text)) {
          usedFallback = true;
          text = draft.text;
        }
      }
    }
    const footer =
      lang === "ar"
        ? `\n(من نسخة محفوظة لصفحات البنك العامة بتاريخ ${citations[0]?.captured ?? ""}. قد تكون الأسعار والرسوم تغيرت؛ تأكد من البنك.)`
        : `\n(From an archived copy of the bank's public pages captured ${citations[0]?.captured ?? ""}. Rates and fees may have changed; confirm with the bank.)`;
    const answer = text.trim() + footer;
    yield {
      type: "final",
      result: {
        ...base, answer, refused: false, citations, retrieved, removedSentences: removed, usedFallback,
        grounding: checkNumbers(text, sourceTexts),
        timings: { retrieveMs, generateMs, totalMs: now() - t0 },
      },
    };
  }
}

function toCitations(sources: SourceRef[]): Citation[] {
  return sources.map(({ n, r }) => ({
    n,
    url: r.chunk.url,
    title: r.chunk.title,
    section: r.chunk.headingPath.join(" › "),
    chunkId: r.chunk.id,
    captured: r.chunk.captured,
    archiveUrl: r.chunk.archiveUrl,
  }));
}
