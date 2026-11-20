import { toWesternDigits } from "../text.ts";

/**
 * Numeric grounding. Rates, fees, limits and tenors may only appear in an
 * answer if the same number appears in one of the cited source chunks.
 */
const NUM_RE = /\d+(?:[.,]\d+)*/g;

/** Canonical form: ASCII digits, thousands separators removed, trailing zeros after a decimal point dropped. */
export function canonicalNumber(raw: string): string {
  let s = toWesternDigits(raw);
  // "20,000" -> "20000"; "0,1250" (Arabic decimal comma) is kept as a decimal.
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(/^0+(?=\d)/, "");
}

export function extractNumbers(text: string): string[] {
  return [...toWesternDigits(text).matchAll(NUM_RE)].map((m) => canonicalNumber(m[0]));
}

export interface GroundingReport {
  numbers: string[];
  ungrounded: string[];
  grounded: boolean;
}

/** Ignore citation markers like [1] and list ordinals like "1." at line start. */
function stripMarkers(text: string): string {
  return text.replace(/\[\d+\]/g, " ").replace(/^\s*\d+[.)]\s/gm, " ");
}

export function checkNumbers(answer: string, sources: string[]): GroundingReport {
  const allowed = new Set(sources.flatMap(extractNumbers));
  const numbers = extractNumbers(stripMarkers(answer));
  const ungrounded = [...new Set(numbers.filter((n) => !allowed.has(n)))];
  return { numbers, ungrounded, grounded: ungrounded.length === 0 };
}

/**
 * Remove every sentence that carries an ungrounded number. Used on generative
 * output: an unverifiable figure is dropped rather than shown.
 */
export function stripUngroundedSentences(answer: string, sources: string[]): { text: string; removed: string[] } {
  const allowed = new Set(sources.flatMap(extractNumbers));
  const removed: string[] = [];
  const kept = answer
    .split(/(?<=[.!?؟\n])\s*/)
    .filter((s) => {
      const bad = extractNumbers(stripMarkers(s)).some((n) => !allowed.has(n));
      if (bad) removed.push(s.trim());
      return !bad;
    });
  return { text: kept.join(" ").replace(/\s+\n/g, "\n").trim(), removed };
}
