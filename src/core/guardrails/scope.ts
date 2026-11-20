import { normalize } from "../text.ts";
import { detectInjection } from "./injection.ts";

/**
 * Out-of-scope and intent detection. Three outcomes besides "in scope":
 *  - account-action: needs the customer's account (balance, block card, dispute) -> hand off to support
 *  - advice: personalised financial or investment advice -> decline, hand off
 *  - off-topic / injection: not about the bank's public products -> decline
 */
export type ScopeVerdict =
  | { kind: "in-scope" }
  | { kind: "account-action" | "advice" | "off-topic" | "injection"; reason: string };

const BANKING_TERMS = normalize(
  [
    "account accounts saving savings current deposit deposits certificate certificates cd cds interest rate rates return yield",
    "card cards credit debit prepaid visa mastercard atm atms pos branch branches loan loans lending finance financing facility",
    "mortgage auto car installment installments fee fees charge charges tariff tariffs commission transfer transfers swift iban",
    "remittance western union online banking internet mobile app application token otp wallet qpay instapay payment payments",
    "cheque cheques check collections trade lc lcs guarantee guarantees treasury fx currency currencies usd eur gbp egp sme smes",
    "corporate business company payroll wealth edge youth minor minors complaint complaints contact hotline call center 19555",
    "security phishing fraud password pin documents requirements open opening minimum balance tenor redemption whatsapp",
    "حساب حسابات توفير جاري وديعة ودائع شهادة شهادات عائد فائدة فوائد سعر بطاقة بطاقات ائتمان خصم مدفوعة فيزا ماستركارد",
    "صراف ماكينة فرع فروع قرض قروض تمويل تسهيلات تقسيط رسوم مصاريف عمولة تحويل تحويلات سويفت ايبان حوالة ويسترن يونيون",
    "الانترنت الإنترنت الموبايل تطبيق محفظة دفع مدفوعات شيك شيكات تحصيل اعتماد اعتمادات ضمان خطاب الخزانة عملة عملات دولار",
    "يورو جنيه الشركات الشركات الصغيرة المتوسطة مرتبات ثروة شكوى شكاوى خدمة العملاء الخط الساخن امان أمان احتيال كلمة سر",
    "مستندات اوراق أوراق فتح الحد الادنى رصيد مدة استرداد واتساب القصر قاصر",
  ].join(" "),
)
  .split(/\s+/)
  .filter(Boolean);

const ACCOUNT_ACTION = [
  /\b(my|our)\s+(balance|account balance|statement|transactions?|transfer|card|loan|application|complaint)\b.*\b(status|show|check|what|is|was|did|failed|pending|stuck|declined|blocked|stolen|lost)\b/i,
  /\b(check|show|tell me|what is|what's)\s+(my|our)\s+(balance|statement|transactions?|limit|pin|iban|account number)\b/i,
  /\b(block|freeze|unblock|cancel|activate|reset)\s+(my|our)\s+(card|account|pin|password|token)\b/i,
  /\b(transfer|send|wire|pay)\s+(\d|egp|usd|\$|money|funds)\b.*\b(to|from)\b/i,
  /\b(my|our)\s+(card|account)\s+(was|is|has been|got)\s+(stolen|lost|hacked|blocked|compromised|charged)\b/i,
  /\b(dispute|chargeback|refund)\s+(a|my|this)\b/i,
  /(رصيدي|كشف حسابي|كم رصيد|حركات حسابي)/,
  /(بطاقتي|كارتي|حسابي|تحويلي|قرضي).{0,25}(اتسرق|سرقت|ضاع|ضاعت|اتقفل|مقفول|موقوف|محظور|اتخصم|خصم مني|متوقف|مرفوض|مش شغال)/,
  /(اتسرق|سرقت|ضاع|ضاعت|اتقفل|اتخصم).{0,25}(بطاقتي|كارتي|حسابي|فلوسي)/,
  /(اوقف|أوقف|الغ|ألغ|فعل|فعّل)\s+(البطاقة|الكارت|الحساب)/,
];

const ADVICE = [
  /\b(should i|is it (a )?good (idea|time)|which is (the )?better|what('s| is) the best)\b.*\b(invest|buy|sell|stock|stocks|shares|crypto|bitcoin|gold|real estate|fund)\b/i,
  /\b(stock|stocks|crypto|bitcoin|forex)\s+(tips?|picks?|prediction|forecast)\b/i,
  /\b(predict|forecast)\b.*\b(exchange rate|dollar|pound|interest rates?)\b/i,
  /(هل (يجب|ينفع|أشتري|اشتري)|انصحني|أنصحني|نصيحة).*(استثمار|اسهم|أسهم|ذهب|بيتكوين|عقار)/,
];

export function classifyScope(query: string): ScopeVerdict {
  const inj = detectInjection(query);
  if (inj.flagged) return { kind: "injection", reason: inj.hits.join(",") };
  if (ACCOUNT_ACTION.some((r) => r.test(query))) return { kind: "account-action", reason: "needs-customer-account" };
  if (ADVICE.some((r) => r.test(query))) return { kind: "advice", reason: "personalised-advice" };
  return { kind: "in-scope" };
}

/** Fraction-free check: does the query mention anything from the banking lexicon? */
export function hasBankingTerm(query: string): boolean {
  const q = normalize(query);
  return BANKING_TERMS.some((t) => (/[a-z0-9]/.test(t) ? new RegExp(`\\b${t}(s|es)?\\b`).test(q) : q.includes(t)));
}
