import { describe, it, expect } from "vitest";
import { accountDisplayName } from "./account-name";

describe("accountDisplayName", () => {
  describe("strips a trailing account-number suffix that the name already carries", () => {
    // SimpleFIN appends " (last4)" to whatever the institution calls the
    // account. When the institution's own name already ends in those digits
    // the result reads the number twice.
    it.each([
      ["Checking-1135 (1135)", "Checking-1135"],
      ["Citi Custom Cash® Card-7319 (7319)", "Citi Custom Cash® Card-7319"],
      ["Robinhood Credit Card **3640 (3640)", "Robinhood Credit Card **3640"],
      ["WELLS FARGO AUTOGRAPH VISA CARD ...2842 (2842)", "WELLS FARGO AUTOGRAPH VISA CARD ...2842"],
      ["Savings 4403 (4403)", "Savings 4403"],
      ["Card·5148 (5148)", "Card·5148"],
    ])("%s -> %s", (input, expected) => {
      expect(accountDisplayName(input)).toBe(expected);
    });
  });

  describe("keeps the suffix when it is the only thing distinguishing the account", () => {
    // These two are real, and differ by nothing but the suffix. Stripping it
    // would render two different accounts identically.
    it.each([
      "Robinhood individual (1722)",
      "Robinhood individual (8904)",
      "Robinhood traditional IRA (7140)",
      "Amazon Prime Rewards Visa Signature (2701)",
      "Crypto (9877)",
      "Portfolio Value (2688)",
    ])("leaves %s alone", (input) => {
      expect(accountDisplayName(input)).toBe(input);
    });
  });

  describe("leaves anything that is not this pattern alone", () => {
    it.each([
      "Main Checking",
      "",
      "Emergency Fund (joint)",
      "401(k)",
      "Checking (12345)", // 5 digits is not a last-4 mask
      "Checking-1135 (1136)", // digits present but different
      "Checking-11350 (1350)", // suffix digits appear mid-token, not at the end
    ])("leaves %s alone", (input) => {
      expect(accountDisplayName(input)).toBe(input);
    });

    it("trims surrounding whitespace only when it strips a suffix", () => {
      expect(accountDisplayName("Checking-1135  (1135)")).toBe("Checking-1135");
      expect(accountDisplayName("  Main Checking  ")).toBe("  Main Checking  ");
    });
  });
});
