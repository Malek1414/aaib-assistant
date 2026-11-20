import type { Lang } from "./text.ts";
import type { Citation, Link, LinkKind } from "./types.ts";

/** Bank support channels, used for refusals and as the contact fallback. */
export const SUPPORT = {
  phone: "19555",
  phoneIntl: "+202 19555",
  contactUrl: { en: "https://www.aaib.com/en/discover-more/customer-rights/contact-us", ar: "https://www.aaib.com/ar/discover-more/customer-rights/contact-us" },
};

/** Actions first: a form or a PDF is more useful under an answer than another page. */
const KIND_ORDER: Record<LinkKind, number> = { form: 0, pdf: 1, app_store: 2, page: 3, phone: 4, email: 5, external: 6 };

const SAFE_HREF = /^(https?:\/\/[^\s"'<>]+|tel:\+?\d{3,15}|mailto:[^\s"'<>@]+@[^\s"'<>@]+)$/i;

/**
 * "Useful links" under an answer: the links of the cited chunks, deduped by
 * href, without the cited pages themselves (they are already the source chips),
 * actions first, then in citation order. At most `max`.
 */
export function usefulLinks(citations: Citation[], max = 5): Link[] {
  const cited = new Set(citations.map((c) => c.url));
  const seen = new Set<string>();
  const pool: { l: Link; order: number }[] = [];
  citations.forEach((c, ci) =>
    (c.links ?? []).forEach((l, li) => {
      if (!SAFE_HREF.test(l.href) || cited.has(l.href) || seen.has(l.href)) return;
      seen.add(l.href);
      pool.push({ l, order: ci * 100 + li });
    }),
  );
  return pool
    .sort((a, b) => KIND_ORDER[a.l.kind] - KIND_ORDER[b.l.kind] || a.order - b.order)
    .slice(0, max)
    .map((p) => p.l);
}

/** What a refusal points to: the hotline and the official contact page. */
export function supportLinks(lang: Lang): Link[] {
  return [
    { text: lang === "ar" ? `خدمة العملاء ${SUPPORT.phone}` : `Customer service ${SUPPORT.phone}`, href: `tel:${SUPPORT.phone}`, kind: "phone" },
    { text: lang === "ar" ? "صفحة التواصل الرسمية" : "Official contact page", href: SUPPORT.contactUrl[lang], kind: "page" },
  ];
}

export const isSafeHref = (href: string) => SAFE_HREF.test(href);
