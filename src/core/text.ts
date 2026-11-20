/** Language-aware text normalisation and tokenisation for English and Arabic. */

export type Lang = "en" | "ar";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic and Persian digits to ASCII, Arabic decimal/thousands separators to '.' and ','. */
export function toWesternDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/(\d)٫(\d)/g, "$1.$2")
    .replace(/(\d)[٬،](\d)/g, "$1,$2")
    .replace(/٪/g, "%");
}

export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟۖ-ۭ]/g, "") // harakat / tashkeel
    .replace(/ـ/g, "") // tatweel
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

export function normalize(s: string): string {
  return normalizeArabic(toWesternDigits(s)).toLowerCase();
}

export function detectLang(s: string): Lang {
  const ar = (s.match(/[؀-ۿ]/g) ?? []).length;
  const lat = (s.match(/[A-Za-z]/g) ?? []).length;
  return ar > lat ? "ar" : "en";
}

const EN_STOP = new Set(
  ("a an and are as at be been but by can could do does for from has have how i if in into is it its me my of on or our " +
    "please should so than that the their them then there these they this to us was we what when where which who why will " +
    "with would you your yours about any tell know want need get much many there's i'm it's aaib bank banks").split(" "),
);
const AR_STOP = new Set(
  normalizeArabic(
    "في من على الى إلى عن مع هل ما ماذا كيف كم لماذا متى أين اين هو هي هم انا أنا انت أنت نحن هذا هذه ذلك تلك التي الذي الذين " +
      "او أو ثم قد كان كانت يكون لا لم لن ان أن إن عند كل بعض اي أي و يا لي لك له لها بنك البنك",
  ).split(" "),
);

/** Very light suffix stripping, enough to merge plural and inflected forms. */
function stemEn(t: string): string {
  if (t.length <= 3 || /\d/.test(t)) return t;
  if (t.endsWith("ies") && t.length > 4) return t.slice(0, -3) + "y";
  if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
  if (t.endsWith("ly") && t.length > 5) return t.slice(0, -2);
  if (t.endsWith("ed") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("es") && /(ss|x|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

/** Light Arabic stemmer (Light10-style): strip common prefixes and suffixes, keep >= 3 letters. */
function stemAr(t: string): string {
  let w = t;
  for (const p of ["وال", "بال", "كال", "فال", "لل", "ال"]) {
    if (w.startsWith(p) && w.length - p.length >= 3) {
      w = w.slice(p.length);
      break;
    }
  }
  if (w.startsWith("و") && w.length >= 5) w = w.slice(1);
  for (const s of ["ها", "ان", "ات", "ون", "ين", "يه", "يه", "ه", "ي"]) {
    if (w.endsWith(s) && w.length - s.length >= 3) {
      w = w.slice(0, -s.length);
      break;
    }
  }
  return w;
}

/**
 * Canonical forms for currencies and for product names that customers write in
 * either script (e.g. "Emerald" / "ايمرالد"). Applied to documents and queries alike.
 */
const CANONICAL: Record<string, string> = Object.fromEntries(
  (
    [
      ["usd", "dollar dollars usd دولار الدولار دولارات"],
      ["eur", "euro euros eur يورو اليورو"],
      ["gbp", "sterling gbp استرليني الاسترليني"],
      ["emerald", "emerald ايمرالد الايمرالد ايميرالد"],
      ["golden", "golden gold جولدن الجولدن"],
      ["edge", "edge ايدج الايدج"],
      ["whatsapp", "whatsapp واتساب الواتساب واتس"],
      ["visa", "visa فيزا الفيزا"],
      ["mastercard", "mastercard ماستركارد"],
      ["qpay", "qpay q-pay كيوباي"],
    ] as const
  ).flatMap(([canon, forms]) => normalizeArabic(forms).split(" ").map((f) => [f, canon])),
);

const TOKEN_RE = /[\p{L}\p{N}]+(?:[.,]\d+)*%?/gu;

export function tokenize(s: string, opts: { keepStop?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const m of normalize(s).matchAll(TOKEN_RE)) {
    let t = m[0];
    const isAr = /[؀-ۿ]/.test(t);
    if (!opts.keepStop && (isAr ? AR_STOP.has(t) : EN_STOP.has(t))) continue;
    const canon = CANONICAL[t];
    if (canon) {
      out.push(canon);
      continue;
    }
    if (!/\d/.test(t)) t = isAr ? stemAr(t) : stemEn(t);
    if (t.length < 2 && !/\d/.test(t)) continue;
    out.push(t);
  }
  return out;
}

/** Sentence / line splitter that keeps table rows and bullet items intact. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?؟])\s+(?=[\p{Lu}؀-ۿ])/u))
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}
