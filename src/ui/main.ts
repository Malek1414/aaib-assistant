import "./styles.css";

// Local-only bank branding. brand-local/ is git-ignored, so public builds never include it.
if (import.meta.env.VITE_BRAND === "aaib") {
  const brand = import.meta.glob("../../brand-local/brand.ts");
  for (const load of Object.values(brand)) void load();
}
import type { AssistantResult } from "../core/assistant.ts";
import type { RetrievalMode } from "../core/retrieve.ts";
import type { Lang } from "../core/text.ts";
import type { Citation } from "../core/types.ts";
import { Engine, type EngineId } from "./engine.ts";
import { LINK_KIND_LABELS, PII_LABELS, STRINGS, SUGGESTION_TOPICS, SUGGESTIONS } from "./i18n.ts";
import { icon, rosette } from "./icons.ts";
import { escapeHtml, renderAnswer, renderSources, renderUsefulLinks } from "./render.ts";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const root = document.documentElement;
const log = $<HTMLElement>("#log");
const welcome = $<HTMLElement>("#welcome");
const form = $<HTMLFormElement>("#composer");
const input = $<HTMLTextAreaElement>("#input");
const send = $<HTMLButtonElement>("#send");
const status = $<HTMLElement>("#model-status");
const settings = $<HTMLElement>("#settings");
const settingsToggle = $<HTMLButtonElement>("#settings-toggle");
const scrim = $<HTMLElement>("#settings-scrim");
const toBottom = $<HTMLButtonElement>("#to-bottom");
const newChat = $<HTMLButtonElement>("#new-chat");
const count = $<HTMLElement>("#count");

const MAX = 600;
let uiLang: Lang = readPref("lang", "en") === "ar" ? "ar" : "en";
let retrievalMode: RetrievalMode = "bm25";
let ready = false;
let busy = false;
let controller: AbortController | null = null;
let counter = 0;
const engine = new Engine();
const t = (k: string, lang: Lang = uiLang) => STRINGS[lang][k] ?? k;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/* ---------- theme ---------- */

const isDark = () => root.dataset.theme === "dark" || (root.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
function syncThemeButton() {
  $("#theme-toggle").setAttribute("aria-pressed", String(isDark()));
}
function toggleTheme() {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  writePref("theme", next);
  syncThemeButton();
}

/* ---------- language & static copy ---------- */

function applyLang() {
  root.lang = uiLang;
  root.dir = uiLang === "ar" ? "rtl" : "ltr";
  document.title = t("title");
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  document.querySelectorAll<HTMLTextAreaElement>("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder!)));
  document.querySelectorAll<HTMLElement>("[data-i18n-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nLabel!));
    el.title = t(el.dataset.i18nLabel!);
  });
  const lt = $("#lang-toggle");
  lt.textContent = t("langToggle");
  lt.lang = uiLang === "en" ? "ar" : "en";
  const topics = SUGGESTION_TOPICS[uiLang];
  $("#suggestions").innerHTML = SUGGESTIONS[uiLang]
    .map(
      (q, i) => `<button type="button" class="suggestion" data-q="${escapeHtml(q)}">
        <span class="topic">${escapeHtml(topics[i] ?? "")}</span>
        <span class="q" dir="auto">${escapeHtml(q)}</span>
        ${icon("arrow", "go")}
      </button>`,
    )
    .join("");
  $("#trust").innerHTML = (
    [
      ["quote", "trustCites"],
      ["ask", "trustHonest"],
      ["lock", "trustLocal"],
    ] as const
  )
    .map(([ic, k]) => `<li>${icon(ic)}<span>${escapeHtml(t(k))}</span></li>`)
    .join("");
}

/* ---------- scrolling ---------- */

const distanceFromBottom = () => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
const nearBottom = () => distanceFromBottom() < 140;
function scrollToEnd(smooth = true) {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth && !reduceMotion() ? "smooth" : "auto" });
}
function syncToBottom() {
  toBottom.hidden = !log.children.length || distanceFromBottom() < 240;
}

/* ---------- messages ---------- */

function startConversation() {
  welcome.hidden = true;
  newChat.hidden = false;
  document.body.classList.add("chatting");
}

function addUser(question: string) {
  const el = document.createElement("article");
  el.className = "msg user";
  el.dataset.testid = "msg-user";
  el.innerHTML = `<h3 class="sr-only">${escapeHtml(t("you"))}</h3><div class="bubble"><p dir="auto">${escapeHtml(question)}</p></div>`;
  log.appendChild(el);
  return el;
}

function addAssistant(): { bubble: HTMLElement; content: HTMLElement; body: HTMLElement } {
  const el = document.createElement("article");
  el.className = "msg assistant";
  el.dataset.testid = "msg-assistant";
  el.setAttribute("aria-busy", "true");
  el.innerHTML = `<div class="avatar" aria-hidden="true">${rosette(32, [[0.74, 0.16, 6, 2]], 160)}</div>
    <div class="content">
      <h3 class="sr-only">${escapeHtml(t("answer"))}</h3>
      <div class="body" dir="auto"><p class="pending"><span class="shimmer">${escapeHtml(t("thinking"))}</span></p></div>
    </div>`;
  log.appendChild(el);
  return { bubble: el, content: el.querySelector(".content")!, body: el.querySelector(".body")! };
}

/** Puts a blinking caret at the end of the last paragraph or list item while text streams in. */
const withCaret = (html: string) =>
  /<\/(p|li)>(<\/ul>)?$/.test(html) ? html.replace(/(<\/(?:p|li)>)(<\/ul>)?$/, '<span class="caret" aria-hidden="true"></span>$1$2') : html + '<span class="caret" aria-hidden="true"></span>';

async function ask(question: string) {
  if (!ready || busy || !question.trim()) return;
  busy = true;
  controller = new AbortController();
  const signal = controller.signal;
  setSendState();
  startConversation();
  const id = `m${++counter}`;
  addUser(question);
  const { bubble, content, body } = addAssistant();
  bubble.dataset.question = question;
  scrollToEnd();
  let text = "";
  let citations: Citation[] = [];
  let lang: Lang = uiLang;
  let done = false;
  try {
    for await (const ev of engine.assistant.stream(question, { retrieval: { mode: retrievalMode, rerank: true, topK: 6 }, signal })) {
      if (signal.aborted) break;
      const follow = nearBottom();
      if (ev.type === "guard") {
        lang = ev.lang;
        body.dir = lang === "ar" ? "rtl" : "ltr";
        bubble.lang = lang;
        if (ev.redactions.length) {
          const kinds = [...new Set(ev.redactions.map((r) => PII_LABELS[lang][r.kind]))].join(", ");
          content.insertAdjacentHTML(
            "afterbegin",
            `<p class="redaction" data-testid="redaction">${icon("shield")}<span>${STRINGS[lang].redacted} ${escapeHtml(kinds)}</span></p>`,
          );
        }
      } else if (ev.type === "sources") {
        citations = ev.citations;
      } else if (ev.type === "token") {
        text += ev.text;
        body.innerHTML =
          withCaret(renderAnswer(text, id, citations)) +
          (engine.assistant.provider.extractive ? "" : `<p class="pending"><span class="shimmer">${STRINGS[lang].verifying}</span></p>`);
      } else if (ev.type === "final") {
        finish(bubble, content, body, ev.result, id, lang);
        done = true;
      }
      if (follow) scrollToEnd(false);
    }
  } catch (err) {
    if (!signal.aborted) {
      console.error(err);
      body.innerHTML = `<p class="error">${icon("info")}<span>${STRINGS[lang].error}</span></p>`;
      addActions(bubble, content, lang, "");
      done = true;
    }
  } finally {
    if (!done) {
      // Stopped by the user: keep what streamed so far and say so.
      body.innerHTML = (text ? renderAnswer(text, id, citations) : "") + `<p class="note stopped">${STRINGS[lang].stopped}</p>`;
      addActions(bubble, content, lang, "");
    }
    bubble.removeAttribute("aria-busy");
    busy = false;
    controller = null;
    setSendState();
    syncToBottom();
    input.focus({ preventScroll: true });
  }
}

function finish(bubble: HTMLElement, content: HTMLElement, body: HTMLElement, r: AssistantResult, id: string, lang: Lang) {
  bubble.dataset.refused = String(r.refused);
  if (r.refused) bubble.classList.add("refused");
  const S = STRINGS[lang];
  const n = r.citations.length;
  const dates = [...new Set(r.citations.map((c) => c.captured))].sort();
  const prov = r.refused
    ? `${icon("info")}<span>${escapeHtml(S.notCovered)}</span>`
    : n
      ? `${icon("seal")}<span>${escapeHtml(n === 1 ? S.grounded1 : n === 2 ? S.grounded2 : S.groundedN.replace("{n}", String(n)))}</span>` +
        (dates.length ? `<span class="dot" aria-hidden="true">·</span><span class="when">${escapeHtml(S.archivedOn.replace("{d}", dates[dates.length - 1]))}</span>` : "")
      : "";
  if (prov) body.insertAdjacentHTML("beforebegin", `<p class="provenance${r.refused ? " info" : ""}">${prov}</p>`);
  body.innerHTML = renderAnswer(r.answer, id, r.citations);
  const notes: string[] = [];
  if (r.removedSentences.length) notes.push(S.removed);
  if (r.usedFallback && !engine.assistant.provider.extractive) notes.push(S.fallback);
  if (notes.length) body.insertAdjacentHTML("beforeend", notes.map((x) => `<p class="note warn">${escapeHtml(x)}</p>`).join(""));
  content.insertAdjacentHTML("beforeend", renderUsefulLinks(r.usefulLinks, { title: S.usefulLinks, kinds: LINK_KIND_LABELS[lang] }));
  content.insertAdjacentHTML("beforeend", renderSources(r.citations, id, { sources: S.sources, archived: S.archived }));
  addActions(bubble, content, lang, `${r.provider} · ${retrievalMode} · ${Math.round(r.timings.totalMs)} ms`);
}

function addActions(_bubble: HTMLElement, content: HTMLElement, lang: Lang, meta: string) {
  const S = STRINGS[lang];
  content.insertAdjacentHTML(
    "beforeend",
    `<div class="msg-actions">
      <button type="button" class="act copy" data-action="copy" aria-label="${escapeHtml(S.copy)}" title="${escapeHtml(S.copy)}">${icon("copy", "i-copy")}${icon("check", "i-check")}<span class="act-label">${escapeHtml(S.copy)}</span></button>
      <button type="button" class="act" data-action="retry" aria-label="${escapeHtml(S.retry)}" title="${escapeHtml(S.retry)}">${icon("retry")}<span class="act-label">${escapeHtml(S.retry)}</span></button>
      ${meta ? `<span class="meta mono" dir="ltr">${escapeHtml(meta)}</span>` : ""}
    </div>`,
  );
}

/** Plain-text version of an answer for the clipboard: the text, then the numbered sources. */
function answerText(bubble: HTMLElement) {
  const body = bubble.querySelector<HTMLElement>(".body")!;
  const clone = body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("sup.cite a").forEach((a) => (a.textContent = `[${a.textContent}]`));
  clone.querySelectorAll("li").forEach((li) => li.prepend("• "));
  const blocks = [...clone.querySelectorAll("p, li")].map((el) => (el.textContent ?? "").trim()).filter(Boolean);
  const sources = [...bubble.querySelectorAll<HTMLElement>('[data-testid="source-chip"]')].map((li) => {
    const a = li.querySelector<HTMLAnchorElement>("a.src")!;
    return `[${li.dataset.n}] ${li.querySelector(".page")?.textContent ?? ""} ${a.href}`;
  });
  return [blocks.join("\n"), sources.join("\n")].filter(Boolean).join("\n\n");
}

async function copyAnswer(btn: HTMLButtonElement) {
  const bubble = btn.closest<HTMLElement>(".msg")!;
  const lang = (bubble.lang as Lang) || uiLang;
  const txt = answerText(bubble);
  let ok = false;
  try {
    await navigator.clipboard.writeText(txt);
    ok = true;
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: txt });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
  }
  toast(ok ? t("copied", lang) : t("copyFailed", lang));
  if (!ok) return;
  btn.dataset.copied = "true";
  btn.querySelector(".act-label")!.textContent = t("copied", lang);
  setTimeout(() => {
    delete btn.dataset.copied;
    btn.querySelector(".act-label")!.textContent = t("copy", lang);
  }, 1800);
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 1800);
}

function highlightSource(link: HTMLAnchorElement, scroll: boolean) {
  const card = document.getElementById(link.getAttribute("href")!.slice(1));
  if (!card) return;
  const details = card.closest("details");
  if (details && !details.open) details.open = true;
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
  if (scroll) card.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
}

function resetChat() {
  controller?.abort();
  log.innerHTML = "";
  welcome.hidden = false;
  newChat.hidden = true;
  document.body.classList.remove("chatting");
  syncToBottom();
  window.scrollTo({ top: 0 });
  input.focus();
}

/* ---------- composer ---------- */

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
  const len = input.value.length;
  count.textContent = len > MAX * 0.8 ? `${len} / ${MAX}` : "";
}

function setSendState() {
  const state = busy ? "busy" : input.value.trim() && ready ? "ready" : "idle";
  send.dataset.state = state;
  send.type = busy ? "button" : "submit";
  send.disabled = state === "idle";
  const label = busy ? t("stop") : t("send");
  send.setAttribute("aria-label", label);
  send.title = label;
  form.setAttribute("aria-busy", String(busy));
}

/* ---------- settings popover ---------- */

function openSettings(open: boolean) {
  settings.hidden = !open;
  scrim.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", String(open));
  if (open) settings.querySelector<HTMLInputElement>("input:checked")?.focus();
}

function wire() {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const q = input.value;
    if (!q.trim()) return;
    input.value = "";
    autosize();
    void ask(q);
  });
  send.addEventListener("click", (e) => {
    if (busy) {
      e.preventDefault();
      controller?.abort();
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    autosize();
    setSendState();
  });

  welcome.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".suggestion");
    if (b) void ask(b.dataset.q ?? "");
  });

  log.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const cite = target.closest<HTMLAnchorElement>("sup.cite a");
    if (cite) {
      e.preventDefault();
      highlightSource(cite, true);
      return;
    }
    const act = target.closest<HTMLButtonElement>("button[data-action]");
    if (act?.dataset.action === "copy") void copyAnswer(act);
    if (act?.dataset.action === "retry") {
      const q = act.closest<HTMLElement>(".msg")?.dataset.question;
      if (q) void ask(q);
    }
  });
  const hover = (e: Event, on: boolean) => {
    const cite = (e.target as HTMLElement).closest<HTMLAnchorElement>("sup.cite a");
    if (!cite) return;
    document.getElementById(cite.getAttribute("href")!.slice(1))?.classList.toggle("hl", on);
  };
  log.addEventListener("mouseover", (e) => hover(e, true));
  log.addEventListener("mouseout", (e) => hover(e, false));
  log.addEventListener("focusin", (e) => hover(e, true));
  log.addEventListener("focusout", (e) => hover(e, false));

  $("#lang-toggle").addEventListener("click", () => {
    uiLang = uiLang === "en" ? "ar" : "en";
    writePref("lang", uiLang);
    applyLang();
    setSendState();
  });
  $("#theme-toggle").addEventListener("click", toggleTheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeButton);
  newChat.addEventListener("click", resetChat);

  settingsToggle.addEventListener("click", () => openSettings(settings.hidden));
  $("#settings-close").addEventListener("click", () => {
    openSettings(false);
    settingsToggle.focus();
  });
  scrim.addEventListener("click", () => openSettings(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settings.hidden) {
      openSettings(false);
      settingsToggle.focus();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    const el = e.target as HTMLElement;
    if (!settings.hidden && !settings.contains(el) && !settingsToggle.contains(el)) openSettings(false);
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

  toBottom.addEventListener("click", () => scrollToEnd());
  window.addEventListener("scroll", syncToBottom, { passive: true });
  window.addEventListener("resize", syncToBottom, { passive: true });
}

async function main() {
  $(".emblem").innerHTML = rosette(160, [
    [0.86, 0.1, 24, 4],
    [0.6, 0.12, 16, 3],
    [0.32, 0.1, 8, 2],
  ]);
  if (!document.querySelector(".mark")?.childElementCount) $(".mark").innerHTML = rosette(36, [[0.76, 0.14, 8, 2], [0.34, 0.12, 5, 2]], 200);
  applyLang();
  syncThemeButton();
  wire();
  setSendState();
  status.textContent = t("loading");
  await engine.init();
  ready = true;
  status.textContent = "";
  setSendState();
  $("#snapshot-info").textContent = `snapshot ${engine.index.snapshot} · ${engine.index.chunks.length} passages · index ${engine.index.version}`;
  document.body.dataset.ready = "true";
  const q = new URLSearchParams(location.search).get("q");
  if (q) void ask(q);
}

void main();
