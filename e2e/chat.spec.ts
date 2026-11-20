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

test("switches the interface to Arabic and RTL, and back", async ({ page }) => {
  await page.locator("#lang-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("h1")).toHaveText("مساعد خدمة عملاء البنك");
  await expect(page.locator(".suggestion").first()).toContainText("جولدن");
  // The composer sits on the right edge's side in RTL: the hint's start is to the right of the send button.
  const hint = await page.locator(".pii-hint").boundingBox();
  const send = await page.locator("#send").boundingBox();
  expect(hint!.x).toBeGreaterThan(send!.x);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.locator("#lang-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("h1")).toHaveText("Bank Support Assistant");
});

const overflowX = (page: import("@playwright/test").Page) =>
  page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) - document.documentElement.clientWidth);

test("has no horizontal scroll at phone width", async ({ page }) => {
  await ask(page, "What is the minimum balance to open a Golden Saving Account?");
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

test("has no horizontal scroll in Arabic either, including a long answer", async ({ page }) => {
  await page.locator("#lang-toggle").click();
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
  await ask(page, "خلال كم يوم عمل يرد البنك على الشكوى بعد إعادة فحصها؟");
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});

test("composer: Enter sends, Shift+Enter adds a line, the send button reflects the state", async ({ page }) => {
  const input = page.locator("#input");
  const send = page.locator("#send");
  await expect(send).toHaveAttribute("data-state", "idle");
  await expect(send).toBeDisabled();
  await input.fill("What is the grace period");
  await expect(send).toHaveAttribute("data-state", "ready");
  await input.press("Shift+Enter");
  await input.pressSequentially("on credit card purchases?");
  await expect(input).toHaveValue("What is the grace period\non credit card purchases?");
  await expect(page.locator('[data-testid="msg-user"]')).toHaveCount(0);
  await input.press("Enter");
  await expect(page.locator('[data-testid="msg-user"]')).toHaveCount(1);
  await expect(input).toHaveValue("");
  const msg = page.locator('[data-testid="msg-assistant"]').last();
  await expect(msg).toHaveAttribute("data-refused", "false");
  await expect(msg).toContainText("55 days");
  await expect(page.locator("#welcome")).toBeHidden();
  await page.locator("#new-chat").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator('[data-testid="msg-assistant"]')).toHaveCount(0);
});

test("copies an answer with its sources", async ({ page, context, browserName }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const msg = await ask(page, "What is the grace period on credit card purchases?");
  const copy = msg.locator('button[data-action="copy"]');
  await copy.click();
  await expect(copy).toHaveAttribute("data-copied", "true");
  if (browserName === "chromium") {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("55 days");
    expect(text).toContain("https://www.aaib.com/en/individual/personal-banking/cards/credit-card");
  }
});

test("a citation marker highlights its source card", async ({ page }) => {
  const msg = await ask(page, "What is the grace period on credit card purchases?");
  await msg.locator("sup.cite a").first().click();
  await expect(msg.locator("#m1-src-1")).toHaveClass(/flash/);
  await expect(msg.locator('[data-testid="sources"]')).toHaveAttribute("open", "");
});

test("toggles dark mode and remembers it", async ({ page }) => {
  const html = page.locator("html");
  const toggle = page.locator("#theme-toggle");
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const before = await bg();
  const wasDark = (await toggle.getAttribute("aria-pressed")) === "true";
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", wasDark ? "light" : "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", String(!wasDark));
  expect(await bg()).not.toBe(before);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", wasDark ? "light" : "dark");
});

test("settings open as a dialog and close with Escape", async ({ page }) => {
  await page.locator("#settings-toggle").click();
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator('#settings input[name="engine"][value="extractive"]')).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("#settings-toggle")).toHaveAttribute("aria-expanded", "false");
});
