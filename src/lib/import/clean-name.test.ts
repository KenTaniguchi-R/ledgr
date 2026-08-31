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

  it("drops a per-unit price clause instead of leaving a dangling currency symbol", () => {
    // Brokerage order text states a price that varies per order, so it is not
    // part of the payee's identity. Stripping only the digits used to leave
    // "buy shares of Qqqm for $ each" on the dashboard.
    expect(cleanTransactionName("buy 4.1371 shares of QQQM for $290.06 each")).toBe(
      "buy shares of Qqqm",
    );
  });

  it("handles a sell order the same way", () => {
    expect(cleanTransactionName("sell 0.5 shares of VOO for $412.10 each")).toBe(
      "sell shares of VOO",
    );
  });

  it("removes a currency amount whole, never leaving a bare symbol", () => {
    expect(cleanTransactionName("Payment to Twitterapi.io $13.33")).not.toContain("$");
  });

  it("leaves a separator where a mid-string price clause was removed", () => {
    // The clause sat at the end in the cases above, so replacing it with "" or
    // " " looked identical. Mid-string, the difference is a mangled word.
    expect(cleanTransactionName("Netflix for $9.99 each Subscription")).toBe(
      "Netflix Subscription",
    );
  });

  it("leaves a separator where a mid-string currency amount was removed", () => {
    expect(cleanTransactionName("Spotify $9.99 Premium")).toBe("Spotify Premium");
  });

  it("removes an amount written with a space after the symbol", () => {
    expect(cleanTransactionName("Hulu $ 12.99 Plan")).toBe("Hulu Plan");
  });

  it.each([["€", "24,90"], ["£", "7.99"], ["¥", "980"]])(
    "removes a %s amount the same way",
    (symbol, value) => {
      expect(cleanTransactionName(`Acme ${symbol}${value} Monthly`)).toBe("Acme Monthly");
    },
  );

  it("removes a price clause that omits the currency symbol", () => {
    // The symbol is optional in the pattern on purpose -- not every feed
    // includes one -- so pin that rather than leave it to look accidental.
    expect(cleanTransactionName("buy 2 shares of VOO for 412.10 each")).toBe(
      "buy shares of VOO",
    );
  });

  it("keeps a currency symbol that is part of a name", () => {
    // A$AP is a name, not an amount — only amounts should disappear.
    expect(cleanTransactionName("A$AP Records")).toContain("A$AP");
  });

  it("never returns an empty string, even for pure boilerplate", () => {
    expect(cleanTransactionName("")).toBe("");
    expect(cleanTransactionName("   0000 1234   ").length).toBeGreaterThan(0);
  });
});
