import { isSafeHref } from "../core/links.ts";
import type { Citation, Link, LinkKind } from "../core/types.ts";

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Minimal, safe renderer for assistant text: everything is escaped first, then
 * bullets, citation markers and http(s) links are turned into markup.
 */
export function renderAnswer(text: string, msgId: string, citations: Citation[]): string {
  const known = new Set(citations.map((c) => c.n));
  const lines = escapeHtml(text).split("\n");
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    let line = raw
      .replace(/\[(\d)\]/g, (_m, n) =>
        known.has(Number(n)) ? `<sup class="cite"><a href="#${msgId}-src-${n}" aria-label="source ${n}">${n}</a></sup>` : "",
      )
      .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    const bullet = /^•\s*/.test(line);
    if (bullet && !inList) {
      out.push("<ul>");
      inList = true;
    } else if (!bullet && inList) {
      out.push("</ul>");
      inList = false;
    }
    line = line.replace(/^•\s*/, "");
    if (!line.trim()) continue;
    const footnote = /^\((From an archived|من نسخة محفوظة)/.test(line);
    out.push(bullet ? `<li>${line}</li>` : `<p${footnote ? ' class="note"' : ""}>${line}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

export function renderSources(citations: Citation[], msgId: string, labels: { sources: string; archived: string }): string {
  if (!citations.length) return "";
  const chips = citations
    .map(
      (c) => `<li id="${msgId}-src-${c.n}" class="chip" data-testid="source-chip">
        <span class="num">${c.n}</span>
        <a class="src" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(c.url)}">
          <span class="page">${escapeHtml(c.title)}</span>
          ${c.section ? `<span class="section">${escapeHtml(c.section)}</span>` : ""}
          <span class="url mono">${escapeHtml(c.url.replace(/^https?:\/\//, ""))}</span>
        </a>
        <a class="arch" href="${escapeHtml(c.archiveUrl.replace("id_/", "/"))}" target="_blank" rel="noopener noreferrer">${labels.archived} · ${escapeHtml(c.captured)}</a>
      </li>`,
    )
    .join("");
  return `<div class="sources"><h3>${labels.sources}</h3><ol>${chips}</ol></div>`;
}

/** Small inline icons per link kind (decorative; the kind is also given as text for screen readers). */
const ICON: Record<LinkKind, string> = {
  page: '<path d="M4 2h6l4 4v8H4z M10 2v4h4" />',
  pdf: '<path d="M4 2h6l4 4v8H4z M10 2v4h4 M6.5 9.5h5 M6.5 12h3.5" />',
  form: '<path d="M4 2h8v12H4z M6 5h4 M6 8h4 M6 11h2" />',
  phone: '<path d="M5 2.5l2 3-1.3 1.3a7 7 0 0 0 3.5 3.5L10.5 9l3 2-1 2.5C7.5 13.5 2.5 8.5 2.5 3.5z" />',
  email: '<path d="M2.5 4h11v8h-11z M2.5 4.5l5.5 4 5.5-4" />',
  app_store: '<path d="M5 1.5h6v13H5z M7 12.5h2" />',
  external: '<path d="M9 2.5h4.5V7 M13.5 2.5L7.5 8.5 M11.5 9.5v4h-9v-9h4" />',
};

/**
 * "Useful links" under an answer (or the support links under a refusal).
 * Every href was vetted at ingestion; it is checked again here (http(s), tel:, mailto: only)
 * and all text is escaped. Link text gets dir="auto" so Arabic and English labels each read correctly.
 */
export function renderUsefulLinks(links: Link[], labels: { title: string; kinds: Record<LinkKind, string> }): string {
  const items = links
    .filter((l) => isSafeHref(l.href))
    .map((l) => {
      const web = /^https?:/i.test(l.href);
      const target = web ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<li data-testid="useful-link" data-kind="${l.kind}">
        <a href="${escapeHtml(l.href)}"${target}>
          <svg class="ico" viewBox="0 0 16 16" aria-hidden="true">${ICON[l.kind] ?? ICON.page}</svg>
          <span class="kind">${escapeHtml(labels.kinds[l.kind] ?? l.kind)}</span>
          <span class="txt" dir="auto">${escapeHtml(l.text)}</span>
        </a>
      </li>`;
    })
    .join("");
  return items ? `<div class="useful-links" data-testid="useful-links"><h3>${escapeHtml(labels.title)}</h3><ul>${items}</ul></div>` : "";
}
