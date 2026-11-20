import { describe, expect, it } from "vitest";
import { looksLikeEgyptianNationalId, luhnValid, redactPii } from "../src/core/guardrails/pii.ts";

describe("PII redaction", () => {
  it("redacts Luhn-valid card numbers with spaces or dashes", () => {
    const r = redactPii("my card 4111 1111 1111 1111 and 5500-0000-0000-0004");
    expect(r.text).toBe("my card [CARD] and [CARD]");
    expect(r.redactions.map((x) => x.kind)).toEqual(["CARD", "CARD"]);
  });
  it("redacts card numbers typed in Arabic-Indic digits", () => {
    expect(redactPii("رقم بطاقتي ٤١١١١١١١١١١١١١١١").text).toContain("[CARD]");
  });
  it("redacts Egyptian national IDs but not random 14-digit strings", () => {
    expect(looksLikeEgyptianNationalId("29801150101234")).toBe(true);
    expect(redactPii("ID 29801150101234 please").text).toBe("ID [NATIONAL_ID] please");
    expect(looksLikeEgyptianNationalId("19801150101234")).toBe(false);
  });
  it("redacts Egyptian mobiles and international numbers", () => {
    expect(redactPii("call me on 01012345678").text).toBe("call me on [PHONE]");
    expect(redactPii("or +20 101 234 5678").text).toBe("or [PHONE]");
    expect(redactPii("UK: +44 20 7946 0958").text).toBe("UK: [PHONE]");
  });
  it("redacts e-mails and IBANs", () => {
    expect(redactPii("mail a.b@example.com").text).toBe("mail [EMAIL]");
    expect(redactPii("IBAN EG380019000500000000263180002").text).toBe("IBAN [IBAN]");
  });
  it("leaves hotlines, amounts and rates alone", () => {
    const q = "Is 19555 the hotline? Minimum is EGP 20,000 at 17.25% for 1,000,000";
    expect(redactPii(q)).toEqual({ text: q, redactions: [] });
  });
  it("only keeps a 2-character hint, never the value", () => {
    const r = redactPii("4111111111111111");
    expect(r.redactions[0].hint).toBe("11");
    expect(JSON.stringify(r)).not.toContain("4111111111111111");
  });
  it("implements Luhn", () => {
    expect(luhnValid("79927398713")).toBe(true);
    expect(luhnValid("79927398710")).toBe(false);
  });
});
