import { describe, it, expect } from "vitest";
import { cleanTransactionName } from "./clean-name";

describe("cleanTransactionName", () => {
  it("strips ACH type prefix, date/time, and reference numbers", () => {
    expect(
      cleanTransactionName("ACH ELECTRONIC DEBIT May11 05:25a 0000 CHASE CREDIT CRD AUTOPAY"),
    ).toBe("Chase Credit CRD Autopay");
  });

  it("preserves short acronyms while title-casing long ALL-CAPS words", () => {
    expect(
      cleanTransactionName("ACH Electronic Credit APPLE GS SAVINGS TRANSFER 910181695826"),
    ).toBe("Apple GS Savings Transfer");
  });

  it("strips a trailing reference number and its lone check digit", () => {
    expect(
      cleanTransactionName("ACH Electronic Debit - CITI AUTOPAY PAYMENT 271941385710279 1"),
    ).toBe("Citi Autopay Payment");
  });

  it("falls back to a friendly label when only boilerplate remains", () => {
    expect(cleanTransactionName("ZELLE DEBIT May11 02:08p 9054")).toBe("Zelle");
  });

  it("extracts the payee from a Zelle NAME: field", () => {
    expect(
      cleanTransactionName("Zelle Credit PAY ID:BACAqiovd7b1 ORG ID:BAC NAME:BAHAR RABIEI"),
    ).toBe("Bahar Rabiei");
  });

  it("strips a POS prefix and MM/DD date", () => {
    expect(cleanTransactionName("POS DEBIT 04/12 STARBUCKS STORE 1234")).toBe("Starbucks Store");
  });

  it.each(["Amazon", "In-N-Out Burger", "Netflix", "CVS Pharmacy"])(
    "leaves an already-clean name unchanged: %s",
    (name) => {
      expect(cleanTransactionName(name)).toBe(name);
    },
  );

  it("never returns an empty string, even for pure boilerplate", () => {
    expect(cleanTransactionName("")).toBe("");
    expect(cleanTransactionName("   0000 1234   ").length).toBeGreaterThan(0);
  });
});
