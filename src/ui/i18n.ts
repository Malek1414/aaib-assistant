import type { Lang } from "../core/text.ts";

export const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    title: "Bank Support Assistant",
    subtitle: "AAIB internship rebuild · unofficial",
    settings: "Settings",
    retrieval: "Retrieval",
    retrievalFast: "Keyword + rerank (instant)",
    retrievalHybrid: "Hybrid with multilingual embeddings (118 MB, cached)",
    engine: "Answer engine",
    engineExtractive: "Extractive: quotes the source, no model",
    engineLocal: "Qwen2.5-0.5B in your browser (~500 MB, WebGPU recommended)",
    engineOllama: "Ollama on localhost (dev)",
    welcome:
      "Ask about accounts, cards, certificates, fees or digital banking. Every answer is taken from the bank's public pages and cites them. If the pages don't say, I'll tell you and point you to customer service.",
    placeholder: "Ask a question",
    send: "Send",
    privacy:
      "Never type card numbers, national IDs or passwords. Anything that looks like one is removed before processing, and nothing leaves your browser in the default mode.",
    disclaimer:
      "Rebuild (2026) of an assistant I built during my 2025 AAIB internship. Not affiliated with or endorsed by AAIB. Uses only public information.",
    sources: "Sources",
    archived: "archived copy",
    redacted: "Removed before processing:",
    loading: "Loading the knowledge snapshot…",
    thinking: "Searching the public pages…",
    verifying: "Checking every figure against the sources…",
    removed: "Removed a sentence whose figure is not in the sources.",
    fallback: "The model's answer could not be verified, so the quoted source text is shown instead.",
    error: "Something went wrong. Please try again.",
    langToggle: "عربي",
  },
  ar: {
    title: "مساعد خدمة عملاء البنك",
    subtitle: "إعادة بناء لمشروع تدريب AAIB · غير رسمي",
    settings: "الإعدادات",
    retrieval: "البحث",
    retrievalFast: "كلمات مفتاحية مع إعادة ترتيب (فوري)",
    retrievalHybrid: "بحث هجين بنموذج متعدد اللغات (118 ميجابايت)",
    engine: "طريقة الإجابة",
    engineExtractive: "اقتباس مباشر من المصدر بدون نموذج",
    engineLocal: "نموذج Qwen2.5-0.5B داخل المتصفح (حوالي 500 ميجابايت)",
    engineOllama: "Ollama على الجهاز المحلي (للتطوير)",
    welcome:
      "اسأل عن الحسابات أو البطاقات أو الشهادات أو الرسوم أو الخدمات الرقمية. كل إجابة مأخوذة من صفحات البنك العامة مع ذكر المصدر. وإذا لم تذكر الصفحات المعلومة سأخبرك بذلك وأوجهك لخدمة العملاء.",
    placeholder: "اكتب سؤالك",
    send: "إرسال",
    privacy:
      "لا تكتب أبدًا رقم البطاقة أو الرقم القومي أو كلمات السر. أي شيء يشبهها يُحذف قبل المعالجة، ولا يغادر شيء متصفحك في الوضع الافتراضي.",
    disclaimer:
      "إعادة بناء (2026) لمساعد صممته أثناء تدريبي في AAIB عام 2025. غير تابع للبنك ولا معتمد منه. يستخدم المعلومات العامة فقط.",
    sources: "المصادر",
    archived: "نسخة مؤرشفة",
    redacted: "تم الحذف قبل المعالجة:",
    loading: "جارٍ تحميل نسخة المعرفة…",
    thinking: "جارٍ البحث في الصفحات العامة…",
    verifying: "جارٍ التحقق من كل رقم في المصادر…",
    removed: "تم حذف جملة تحتوي على رقم غير موجود في المصادر.",
    fallback: "تعذر التحقق من إجابة النموذج، لذلك يظهر نص المصدر المقتبس بدلًا منها.",
    error: "حدث خطأ. حاول مرة أخرى.",
    langToggle: "English",
  },
};

export const SUGGESTIONS: Record<Lang, string[]> = {
  en: [
    "What is the minimum balance for the Golden Saving Account?",
    "What is the grace period on credit cards?",
    "Will the bank ever ask for my OTP?",
    "How do I submit a complaint?",
  ],
  ar: [
    "ما هو الحد الأدنى لفتح حساب التوفير جولدن؟",
    "ما هي المستندات المطلوبة لفتح حسابات للقصر؟",
    "كيف أستخدم خدمة المحادثة المصرفية على واتساب؟",
    "هل يطلب البنك معلومات بطاقتي عبر التليفون؟",
  ],
};

export const PII_LABELS: Record<Lang, Record<string, string>> = {
  en: { CARD: "card number", NATIONAL_ID: "national ID", IBAN: "IBAN", PHONE: "phone number", EMAIL: "e-mail address", ACCOUNT_NUMBER: "account number" },
  ar: { CARD: "رقم بطاقة", NATIONAL_ID: "رقم قومي", IBAN: "رقم IBAN", PHONE: "رقم هاتف", EMAIL: "بريد إلكتروني", ACCOUNT_NUMBER: "رقم حساب" },
};
