import { toWesternDigits } from "../text.ts";

/**
 * Input-side PII redaction. Runs before retrieval, logging or any provider
 * call, so card numbers, Egyptian national IDs, phone numbers, IBANs and
 * e-mail addresses never leave the redaction step.
 */
export type PiiKind = "CARD" | "NATIONAL_ID" | "IBAN" | "PHONE" | "EMAIL" | "ACCOUNT_NUMBER";

export interface Redaction {
  kind: PiiKind;
  /** Last 2 characters only, for the user-facing notice. Never the full value. */
  hint: string;
}

export interface RedactionResult {
  text: string;
  redactions: Redaction[];
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/**
 * Egyptian national ID: 14 digits = century (2|3) + YYMMDD + governorate (2) +
 * sequence (4) + check digit. Validate century, month, day and governorate.
 */
export function looksLikeEgyptianNationalId(d: string): boolean {
  if (!/^[23]\d{13}$/.test(d)) return false;
  const mm = Number(d.slice(3, 5));
  const dd = Number(d.slice(5, 7));
  const gov = Number(d.slice(7, 9));
  const govOk = (gov >= 1 && gov <= 35) || gov === 88;
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && govOk;
}

const RULES: { kind: PiiKind; re: RegExp; check?: (digits: string, raw: string) => boolean }[] = [
  { kind: "EMAIL", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "IBAN", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  // National IDs first: 14 digits with a valid date and governorate code are IDs even if they pass Luhn.
  { kind: "NATIONAL_ID", re: /(?<!\d)\d{14}(?!\d)/g, check: (d) => looksLikeEgyptianNationalId(d) },
  // 13-19 digits, optionally grouped by spaces or dashes; Luhn-valid, or the classic 4x4 layout.
  {
    kind: "CARD",
    re: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    check: (d, raw) => d.length >= 13 && d.length <= 19 && (luhnValid(d) || /^\d{4}([ -])\d{4}\1\d{4}\1\d{4}$/.test(raw.trim())),
  },
  // Egyptian mobiles (010/011/012/015), with optional +20 / 0020 prefix, plus generic international numbers.
  { kind: "PHONE", re: /(?<![\d+])(?:(?:\+|00)20[ -]?)?0?1[0125](?:[ -]?\d){8}(?!\d)/g },
  { kind: "PHONE", re: /(?<![\d])\+\d{1,3}(?:[ -]?\d){7,12}(?!\d)/g },
  // Any remaining long digit run is treated as an account or reference number.
  { kind: "ACCOUNT_NUMBER", re: /(?<![\d.,])\d{10,18}(?![\d.,%])/g },
];

export function redactPii(input: string): RedactionResult {
  let text = toWesternDigits(input);
  const redactions: Redaction[] = [];
  for (const rule of RULES) {
    text = text.replace(rule.re, (raw) => {
      const digits = raw.replace(/\D/g, "");
      if (rule.check && !rule.check(digits, raw)) return raw;
      redactions.push({ kind: rule.kind, hint: raw.replace(/\s/g, "").slice(-2) });
      return `[${rule.kind}]`;
    });
  }
  return { text, redactions };
}
