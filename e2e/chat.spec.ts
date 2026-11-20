import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("body[data-ready=true]")).toBeAttached();
});

async function ask(page: import("@playwright/test").Page, q: string) {
  await page.locator("#input").fill(q);
  await page.locator("#input").press("Enter");
  const msg = page.locator('[data-testid="msg-assistant"]').last();
  await expect(msg).toHaveAttribute("data-refused", /true|false/);
  return msg;
}

test("answers an English question with a cited source chip", async ({ page }) => {
  const msg = await ask(page, "What is the grace period on credit card purchases?");
  await expect(msg).toHaveAttribute("data-refused", "false");
  await expect(msg).toContainText("55 days");
  const chip = msg.locator('[data-testid="source-chip"] a.src').first();
  await expect(chip).toHaveAttribute("href", "https://www.aaib.com/en/individual/personal-banking/cards/credit-card");
  await expect(msg.locator("sup.cite a").first()).toHaveAttribute("href", /#m1-src-1/);
});

test("answers in Arabic, right to left, from Arabic pages", async ({ page }) => {
  const msg = await ask(page, "ما هي المستندات المطلوبة لفتح حسابات للقصر؟");
  await expect(msg).toHaveAttribute("data-refused", "false");
  await expect(msg.locator(".body")).toHaveAttribute("dir", "rtl");
  await expect(msg.locator('[data-testid="source-chip"] a.src').first()).toHaveAttribute("href", /\/ar\//);
});

test("refuses ungrounded questions and hands off to support", async ({ page }) => {
  const msg = await ask(page, "What is the interest rate on the crypto savings account?");
  await expect(msg).toHaveAttribute("data-refused", "true");
  await expect(msg).toContainText("I can't find that on AAIB's public pages");
  await expect(msg).toContainText("19555");
  await expect(msg.locator('[data-testid="source-chip"]')).toHaveCount(0);
});

test("lists useful links from the cited chunks under the sources", async ({ page }) => {
  const msg = await ask(page, "Where can I download the retail tariff?");
  await expect(msg).toHaveAttribute("data-refused", "false");
  const links = msg.locator('[data-testid="useful-link"]');
  await expect(msg.locator('[data-testid="useful-links"] h3')).toHaveText("Useful links");
  await expect(links.first()).toHaveAttribute("data-kind", "pdf");
  await expect(links.first().locator("a")).toHaveAttribute("href", "https://www.aaib.com/pdfs/retail_tariff.pdf");
  expect(await links.count()).toBeLessThanOrEqual(5);
  const hrefs = await links.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  expect(hrefs.every((h) => !h.includes("web.archive.org"))).toBe(true);
});

test("a refusal points to the hotline and the contact page", async ({ page }) => {
  const msg = await ask(page, "What is the interest rate on the crypto savings account?");
  await expect(msg).toHaveAttribute("data-refused", "true");
  await expect(msg.locator('[data-testid="useful-link"][data-kind="phone"] a')).toHaveAttribute("href", "tel:19555");
  await expect(msg.locator('[data-testid="useful-link"][data-kind="page"] a')).toHaveAttribute("href", /contact-us$/);
});

test("useful links are labelled in Arabic for Arabic answers", async ({ page }) => {
  const msg = await ask(page, "خلال كم يوم عمل يرد البنك على الشكوى بعد إعادة فحصها؟");
  await expect(msg).toHaveAttribute("data-refused", "false");
  await expect(msg.locator('[data-testid="useful-links"] h3')).toHaveText("روابط مفيدة");
  await expect(msg.locator('[data-testid="useful-link"] .txt').first()).toHaveAttribute("dir", "auto");
});

test("redacts a card number before processing and says so", async ({ page }) => {
  await ask(page, "my card 4111 1111 1111 1111 was stolen");
  await expect(page.locator('[data-testid="redaction"]')).toContainText("card number");
});

test("switches the interface to Arabic and RTL", async ({ page }) => {
  await page.locator("#lang-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("h1")).toHaveText("مساعد خدمة عملاء البنك");
});

test("has no horizontal scroll at phone width", async ({ page }) => {
  await ask(page, "What is the minimum balance to open a Golden Saving Account?");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
