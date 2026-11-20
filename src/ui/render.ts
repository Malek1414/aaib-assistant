import { isSafeHref } from "../core/links.ts";
import type { Citation, Link, LinkKind } from "../core/types.ts";
import { icon, type IconName } from "./icons.ts";

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
        known.has(Number(n))
          ? `<sup class="cite"><a href="#${msgId}-src-${n}" data-cite="${n}" aria-label="source ${n}">${n}</a></sup>`
          : "",
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

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
};

/**
 * Sources as cards inside a collapsible row (open by default). Each card links to the
 * live public page and, separately, to the exact archived capture the text was taken from.
 */
export function renderSources(citations: Citation[], msgId: string, labels: { sources: string; archived: string }): string {
  if (!citations.length) return "";
  const cards = citations
    .map((c) => {
      const crumbs = c.title.split(/\s+\/\s+/).filter(Boolean);
      const page = crumbs.pop() ?? c.title;
      const h = host(c.url);
      return `<li id="${msgId}-src-${c.n}" class="chip src-card" data-testid="source-chip" data-n="${c.n}">
        <a class="src" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(c.url)}">
          <span class="src-top"><span class="num">${c.n}</span><span class="fav" aria-hidden="true">${escapeHtml(h.charAt(0).toUpperCase())}</span><span class="host" dir="ltr">${escapeHtml(h)}</span></span>
          <span class="page">${escapeHtml(page)}</span>
          ${crumbs.length || c.section ? `<span class="crumbs">${escapeHtml([...crumbs.slice(-2), c.section].filter(Boolean).join(" › "))}</span>` : ""}
        </a>
        <a class="arch" href="${escapeHtml(c.archiveUrl.replace("id_/", "/"))}" target="_blank" rel="noopener noreferrer">${icon("archive")}<span>${labels.archived} · <span class="date" dir="ltr">${escapeHtml(c.captured)}</span></span></a>
      </li>`;
    })
    .join("");
  const stack = [...new Set(citations.map((c) => host(c.url).charAt(0).toUpperCase()))]
    .slice(0, 3)
    .map((l) => `<span class="fav">${escapeHtml(l)}</span>`)
    .join("");
  return `<details class="sources" open data-testid="sources">
    <summary><span class="fav-stack" aria-hidden="true">${stack}</span><h3>${labels.sources}</h3><span class="count-badge">${citations.length}</span>${icon("chevron", "chev")}</summary>
    <ol>${cards}</ol>
  </details>`;
}

const KIND_ICON: Record<LinkKind, IconName> = {
  page: "page", pdf: "pdf", form: "form", phone: "phone", email: "email", app_store: "app_store", external: "external",
};

/**
 * "Useful links" under an answer (or the support links under a refusal), as action chips.
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
        <a class="action-chip" href="${escapeHtml(l.href)}"${target}>
          <span class="ico-wrap">${icon(KIND_ICON[l.kind] ?? "page")}</span>
          <span class="kind">${escapeHtml(labels.kinds[l.kind] ?? l.kind)}</span>
          <span class="txt" dir="auto">${escapeHtml(l.text)}</span>
          ${web ? icon("arrow", "go") : ""}
        </a>
      </li>`;
    })
    .join("");
  return items ? `<div class="useful-links" data-testid="useful-links"><h3>${escapeHtml(labels.title)}</h3><ul>${items}</ul></div>` : "";
}
