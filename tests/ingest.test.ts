import { describe, expect, it } from "vitest";
import { chunkPage } from "../ingest/chunk.ts";
import { inScope } from "../ingest/config.ts";
import { normalise } from "../ingest/discover.ts";
import { extractHtml, extractRsc, removeBoilerplate, type Extracted } from "../ingest/extract.ts";
import { isUsableHtml } from "../ingest/fetch-pages.ts";
import { isAllowed, looksLikeRobots, parseRobots } from "../ingest/robots.ts";

describe("robots.txt", () => {
  const body = "User-agent: *\nDisallow: /private\nAllow: /private/faq$\nCrawl-delay: 5\n\nUser-agent: BadBot\nDisallow: /";
  it("applies longest-match precedence and $ anchors", () => {
    const r = parseRobots(body, "BankSupportAssistantRebuild/2.0");
    expect(isAllowed(r, "/private/x")).toBe(false);
    expect(isAllowed(r, "/private/faq")).toBe(true);
    expect(isAllowed(r, "/smes/lending")).toBe(true);
    expect(r.crawlDelaySec).toBe(5);
  });
  it("uses the agent-specific group when present", () => {
    expect(isAllowed(parseRobots(body, "BadBot/1.0"), "/anything")).toBe(false);
  });
  it("does not mistake a WAF rejection page for robots.txt", () => {
    expect(looksLikeRobots("<html><head><title>Request Rejected</title></head></html>")).toBe(false);
    expect(looksLikeRobots(body)).toBe(true);
  });
});

describe("crawl scope", () => {
  it("allows product, FAQ and support pages only", () => {
    expect(inScope("/individual/edge/accounts/golden-saving-account")).toBe(true);
    expect(inScope("/discover-more/faq")).toBe(true);
    expect(inScope("/careers")).toBe(false);
    expect(inScope("/about/management-team")).toBe(false);
    expect(inScope("/fx-rates")).toBe(false);
    expect(inScope("/individual/personal-banking/cards/&")).toBe(false);
  });
  it("normalises locale prefixes and hosts", () => {
    expect(normalise("https://aaib.com/ar/smes/lending/")).toEqual({ locale: "ar", path: "/smes/lending" });
    expect(normalise("http://www.aaib.com/individual/edge")).toEqual({ locale: "en", path: "/individual/edge" });
    expect(normalise("https://example.com/x")).toBeNull();
    expect(normalise("https://aaib.com/?gclid=1")).toBeNull();
  });
  it("rejects WAF and Wayback error captures", () => {
    expect(isUsableHtml("<html><title>Request Rejected</title></html>")).toBe("waf-rejection-page");
    expect(isUsableHtml("<html>" + "x".repeat(4000) + "</html>")).toBeNull();
  });
});

describe("extraction", () => {
  it("zips tables whose cells hold parallel lists into self-describing rows", () => {
    const html = `<html><body><main><h2>EGP Rate</h2><table><thead><tr><th>Frequency</th><th>Amount</th><th>Interest</th></tr></thead>
      <tbody><tr><td>Monthly</td><td><ol><li>5K to 100K</li><li>100K to 500K</li></ol></td><td><ol><li>3.500%</li><li>4.250%</li></ol></td></tr></tbody></table></main></body></html>`;
    const e = extractHtml(html);
    expect(e.blocks.filter((b) => b.kind === "row").map((b) => b.text)).toEqual([
      "Frequency: Monthly; Amount: 5K to 100K; Interest: 3.500%",
      "Frequency: Monthly; Amount: 100K to 500K; Interest: 4.250%",
    ]);
  });
  it("drops navigation, scripts and site header chrome", () => {
    const e = extractHtml(`<html><body><header><nav>Exchange Rates Careers</nav></header><script>x()</script><main><p>Real content here.</p></main><footer>Hotline</footer></body></html>`);
    expect(e.blocks.map((b) => b.text)).toEqual(["Real content here."]);
  });
  it("recovers text from the React Server Components payload", () => {
    const payload = JSON.stringify('1:["$","div",null,{"children":[["$","h2",null,{"children":"Fast-Track Lending"}],["$","p",null,{"children":"Up to EGP 5M for Small Enterprises."}]]}]\n');
    const e = extractRsc(`<html><title>T</title><script>self.__next_f.push([1,${payload}])</script></html>`);
    expect(e.blocks).toEqual([
      { kind: "heading", level: 2, text: "Fast-Track Lending" },
      { kind: "text", text: "Up to EGP 5M for Small Enterprises." },
    ]);
  });
  it("removes blocks repeated across many pages of the same locale", () => {
    const mk = (extra: string): { locale: string; extracted: Extracted } => ({
      locale: "en",
      extracted: { title: "", method: "html", blocks: [{ kind: "text", text: "Hotline 19555" }, { kind: "text", text: extra }] },
    });
    const pages = [mk("a"), mk("b"), mk("c"), mk("d")];
    removeBoilerplate(pages);
    expect(pages.map((p) => p.extracted.blocks.map((b) => b.text))).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });
});

describe("chunking", () => {
  const page = { url: "https://www.aaib.com/en/x", locale: "en" as const, title: "X", archiveUrl: "a", captured: "2025-01-01" };
  it("starts a chunk at every heading and records the heading trail", () => {
    const chunks = chunkPage(page, [
      { kind: "heading", level: 2, text: "Cards" },
      { kind: "text", text: "Grace period of up to 55 days on all purchases" },
      { kind: "heading", level: 3, text: "FAQs" },
      { kind: "text", text: "How can I apply? Visit your nearest branch today." },
    ]);
    expect(chunks.map((c) => c.headingPath)).toEqual([["Cards"], ["Cards", "FAQs"]]);
    expect(chunks.every((c) => c.url === page.url && c.id.length === 12)).toBe(true);
  });
  it("respects the word budget without splitting lines", () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ kind: "text" as const, text: `line ${i} has exactly six words` }));
    const chunks = chunkPage(page, lines, { maxWords: 40, overlapLines: 1 });
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((c) => c.text.split(/\s+/).length <= 40)).toBe(true);
  });
  it("drops call-to-action noise", () => {
    expect(chunkPage(page, [{ kind: "text", text: "Download" }, { kind: "text", text: "Learn more" }])).toEqual([]);
  });
});
