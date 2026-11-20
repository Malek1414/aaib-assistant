/**
 * Crawl scope and politeness policy. Everything the crawler is allowed to touch
 * is declared here so the data flow can be reviewed in one place.
 */
export const SITE_HOSTS = ["www.aaib.com", "aaib.com"] as const;
export const CANONICAL_ORIGIN = "https://www.aaib.com";

export const USER_AGENT =
  "BankSupportAssistantRebuild/2.0 (portfolio research crawler; public pages only; 1 req per 2s)";

/** Minimum delay between two requests to the same host, in ms. */
export const REQUEST_INTERVAL_MS = 2000;
export const MAX_RETRIES = 4;

/** Only public product, FAQ, tariff and support pages are in scope. */
export const ALLOW_PATH_PATTERNS: RegExp[] = [
  /^\/individual(\/|$)/,
  /^\/smes(\/|$)/,
  /^\/corporate(\/|$)/,
  /^\/discover-more\/(faq|tariffs|customer-rights)(\/|$)/,
  /^\/security-tips$/,
  /^\/debit-card$/,
  /^\/credit-card-offers$/,
  /^\/online-banking$/,
  /^\/tariffs$/,
  /^\/personal(\/|$)/,
  /^\/deposits\//,
  /^\/pages\/(Auto-Loan|Cardholders-Offers|Click2Shop|EduInvest|Emerald-Certificates-of-Deposits|MOSTADAM|Western-Union)$/,
];

/**
 * Explicitly out of scope even if a pattern above matches: people, careers,
 * investor material, news, live market data, logins and binary downloads.
 */
export const DENY_PATH_PATTERNS: RegExp[] = [
  /careers/i,
  /news/i,
  /investor/i,
  /management|board|executive/i,
  /financial-reports|annual-reports|financialSynopsis/i,
  /fx-rates|ratesHistory|services\/rates/i,
  /login|signin/i,
  /\.(pdf|png|jpe?g|svg|css|js|json|xml|txt|ttf|swf|ico)$/i,
  /[&:%]$/,
];

export function inScope(path: string): boolean {
  if (DENY_PATH_PATTERNS.some((r) => r.test(path))) return false;
  return ALLOW_PATH_PATTERNS.some((r) => r.test(path));
}
