import { describe, expect, it } from "vitest";
import { detectLang, normalize, splitSentences, toWesternDigits, tokenize } from "../src/core/text.ts";

describe("text normalisation", () => {
  it("maps Arabic-Indic digits and separators to ASCII", () => {
    expect(toWesternDigits("٢٠,٠٠٠ و ٣٫٥٠٪")).toBe("20,000 و 3.50%");
  });
  it("unifies alef forms, ta marbuta and strips diacritics", () => {
    expect(normalize("إِيداع أمان الشهادة")).toBe("ايداع امان الشهاده");
  });
  it("detects Arabic vs English", () => {
    expect(detectLang("ما هو الحد الأدنى؟")).toBe("ar");
    expect(detectLang("What is the minimum?")).toBe("en");
  });
  it("drops stop words and stems plurals", () => {
    expect(tokenize("What are the fees for the cards?")).toEqual(["fee", "card"]);
  });
  it("canonicalises currencies and product names across scripts", () => {
    expect(tokenize("US dollars")).toContain("usd");
    expect(tokenize("الدولار")).toEqual(["usd"]);
    expect(tokenize("شهادة إيمرالد")).toContain("emerald");
  });
  it("keeps table rows intact when splitting sentences", () => {
    expect(splitSentences("Frequency: Monthly; Interest: 3.500%\nOffered to individuals only")).toHaveLength(2);
  });
});
