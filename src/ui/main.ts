import "./styles.css";
import type { AssistantResult } from "../core/assistant.ts";
import type { RetrievalMode } from "../core/retrieve.ts";
import type { Lang } from "../core/text.ts";
import type { Citation } from "../core/types.ts";
import { Engine, type EngineId } from "./engine.ts";
import { PII_LABELS, STRINGS, SUGGESTIONS } from "./i18n.ts";
import { escapeHtml, renderAnswer, renderSources } from "./render.ts";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const log = $<HTMLElement>("#log");
const form = $<HTMLFormElement>("#composer");
const input = $<HTMLTextAreaElement>("#input");
const send = $<HTMLButtonElement>("#send");
const status = $<HTMLElement>("#model-status");

let uiLang: Lang = readPref("lang", "en") as Lang;
let retrievalMode: RetrievalMode = "bm25";
let busy = false;
let counter = 0;
const engine = new Engine();
const t = (k: string) => STRINGS[uiLang][k] ?? k;

function readPref(key: string, def: string) {
  try {
    return localStorage.getItem(`bsa:${key}`) ?? def;
  } catch {
    return def;
  }
}
function writePref(key: string, val: string) {
  try {
    localStorage.setItem(`bsa:${key}`, val);
  } catch {
    /* storage unavailable */
  }
}

function applyLang() {
  document.documentElement.lang = uiLang;
  document.documentElement.dir = uiLang === "ar" ? "rtl" : "ltr";
  document.title = t("title");
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  document.querySelectorAll<HTMLTextAreaElement>("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder!)));
  $("#lang-toggle").textContent = t("langToggle");
  const sug = $("#suggestions");
  sug.innerHTML = SUGGESTIONS[uiLang].map((q) => `<button type="button" class="suggestion" dir="auto">${escapeHtml(q)}</button>`).join("");
}

function addMessage(role: "user" | "assistant", html: string): HTMLElement {
  $("#welcome")?.remove();
  const el = document.createElement("article");
  el.className = `msg ${role}`;
  el.dataset.testid = `msg-${role}`;
  el.innerHTML = html;
  log.appendChild(el);
  el.scrollIntoView({ block: "end", behavior: "smooth" });
  return el;
}

async function ask(question: string) {
  if (busy || !question.trim()) return;
  busy = true;
  send.disabled = true;
  const id = `m${++counter}`;
  addMessage("user", `<p dir="auto">${escapeHtml(question)}</p>`);
  const bubble = addMessage("assistant", `<div class="body" dir="auto"><p class="pending">${t("thinking")}</p></div>`);
  const body = bubble.querySelector<HTMLElement>(".body")!;
  let text = "";
  let citations: Citation[] = [];
  let lang: Lang = uiLang;
  try {
    for await (const ev of engine.assistant.stream(question, { retrieval: { mode: retrievalMode, rerank: true, topK: 6 } })) {
      if (ev.type === "guard") {
        lang = ev.lang;
        body.dir = lang === "ar" ? "rtl" : "ltr";
        if (ev.redactions.length) {
          const kinds = [...new Set(ev.redactions.map((r) => PII_LABELS[lang][r.kind]))].join(", ");
          bubble.insertAdjacentHTML("afterbegin", `<p class="redaction" data-testid="redaction">${STRINGS[lang].redacted} ${escapeHtml(kinds)}</p>`);
        }
      } else if (ev.type === "sources") {
        citations = ev.citations;
      } else if (ev.type === "token") {
        text += ev.text;
        body.innerHTML = renderAnswer(text, id, citations) + (engine.assistant.provider.extractive ? "" : `<p class="pending">${STRINGS[lang].verifying}</p>`);
      } else if (ev.type === "final") {
        finish(bubble, body, ev.result, id, lang);
      }
    }
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="error">${STRINGS[lang].error}</p>`;
  } finally {
    busy = false;
    send.disabled = false;
    input.focus();
  }
}

function finish(bubble: HTMLElement, body: HTMLElement, r: AssistantResult, id: string, lang: Lang) {
  bubble.dataset.refused = String(r.refused);
  if (r.refused) bubble.classList.add("refused");
  body.innerHTML = renderAnswer(r.answer, id, r.citations);
  const notes: string[] = [];
  if (r.removedSentences.length) notes.push(STRINGS[lang].removed);
  if (r.usedFallback && !engine.assistant.provider.extractive) notes.push(STRINGS[lang].fallback);
  if (notes.length) body.insertAdjacentHTML("beforeend", notes.map((n) => `<p class="note warn">${escapeHtml(n)}</p>`).join(""));
  bubble.insertAdjacentHTML("beforeend", renderSources(r.citations, id, { sources: STRINGS[lang].sources, archived: STRINGS[lang].archived }));
  bubble.insertAdjacentHTML(
    "beforeend",
    `<p class="meta mono">${r.provider} · ${retrievalMode} · ${Math.round(r.timings.totalMs)} ms</p>`,
  );
  bubble.scrollIntoView({ block: "end", behavior: "smooth" });
}

function wire() {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value;
    input.value = "";
    autosize();
    void ask(q);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  const autosize = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  };
  input.addEventListener("input", autosize);
  log.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".suggestion");
    if (b) void ask(b.textContent ?? "");
  });
  $("#lang-toggle").addEventListener("click", () => {
    uiLang = uiLang === "en" ? "ar" : "en";
    writePref("lang", uiLang);
    applyLang();
  });
  const settings = $("#settings");
  $("#settings-toggle").addEventListener("click", (e) => {
    settings.hidden = !settings.hidden;
    (e.currentTarget as HTMLElement).setAttribute("aria-expanded", String(!settings.hidden));
  });
  settings.addEventListener("change", async (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === "retrieval") {
      if (el.value === "hybrid") {
        status.textContent = "Loading embeddings…";
        try {
          await engine.enableHybrid((m) => (status.textContent = m));
          retrievalMode = "hybrid";
          status.textContent = "Hybrid retrieval ready.";
        } catch (err) {
          console.error(err);
          status.textContent = "Could not load the embedding model; staying on keyword retrieval.";
          (settings.querySelector('input[value="bm25"]') as HTMLInputElement).checked = true;
        }
      } else retrievalMode = "bm25";
    } else if (el.name === "engine") {
      engine.useProvider(el.value as EngineId, (m) => (status.textContent = m));
      status.textContent =
        el.value === "local-llm" ? "The model downloads on your first question, then stays cached." :
        el.value === "ollama" ? "Using http://localhost:11434 (set OLLAMA_ORIGINS to allow this page)." : "";
    }
  });
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV || params.has("ollama")) $("#ollama-option").hidden = false;
}

async function main() {
  applyLang();
  wire();
  send.disabled = true;
  status.textContent = t("loading");
  await engine.init();
  status.textContent = "";
  send.disabled = false;
  $("#snapshot-info").textContent = `snapshot ${engine.index.snapshot} · ${engine.index.chunks.length} passages · index ${engine.index.version}`;
  document.body.dataset.ready = "true";
  const q = new URLSearchParams(location.search).get("q");
  if (q) void ask(q);
}

void main();
