import { describe, expect, it } from "vitest";
import { canonicalNumber, checkNumbers, extractNumbers, stripUngroundedSentences } from "../src/core/answer/grounding.ts";

describe("numeric grounding", () => {
  it("canonicalises numbers across formats and scripts", () => {
    expect(canonicalNumber("20,000")).toBe("20000");
    expect(canonicalNumber("3.500")).toBe("3.5");
    expect(canonicalNumber("٠،١٢٥٠")).toBe("0.125");
    expect(extractNumbers("EGP ٢٠,٠٠٠ at 7.50%")).toEqual(["20000", "7.5"]);
  });
  it("accepts figures that appear in the sources, in any script", () => {
    const r = checkNumbers("The minimum is EGP 20,000 [1].", ["الحد الأدنى ٢٠,٠٠٠ جنيه"]);
    expect(r.grounded).toBe(true);
  });
  it("flags invented figures and ignores citation markers", () => {
    const r = checkNumbers("The rate is 21% [1] [2].", ["The rate is 17.25%"]);
    expect(r.ungrounded).toEqual(["21"]);
  });
  it("strips only the sentences that carry ungrounded numbers", () => {
    const out = stripUngroundedSentences("Minimum is EGP 5,000 [1]. The fee is EGP 250 [1]. Apply at a branch [1].", ["Minimum certificate amount is EGP 5,000"]);
    expect(out.removed).toEqual(["The fee is EGP 250 [1]."]);
    expect(out.text).toContain("5,000");
    expect(out.text).not.toContain("250");
  });
});
