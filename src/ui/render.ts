import type { Citation } from "../core/types.ts";

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
