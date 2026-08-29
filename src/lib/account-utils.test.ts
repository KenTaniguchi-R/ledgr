import { describe, test, expect } from "vitest";
import {
  classifyAccountType,
  inferAccountTypeFromName,
  ASSET_TYPES,
  LIABILITY_TYPES,
} from "./account-utils";

describe("classifyAccountType", () => {
  test("liability types classify as liability", () => {
    for (const type of LIABILITY_TYPES) {
      expect(classifyAccountType(type)).toBe("liability");
    }
  });

  test("asset types classify as asset", () => {
    for (const type of ASSET_TYPES) {
      expect(classifyAccountType(type)).toBe("asset");
    }
  });

  test("unknown types default to asset", () => {
    expect(classifyAccountType("mystery")).toBe("asset");
    expect(classifyAccountType("")).toBe("asset");
  });

  test("asset and liability type sets are disjoint", () => {
    for (const type of ASSET_TYPES) {
      expect(LIABILITY_TYPES.has(type)).toBe(false);
    }
  });
});

describe("inferAccountTypeFromName", () => {
  test("recognizes credit cards from the account name", () => {
    const names = [
      "Amazon Prime Rewards Visa Signature",
      "Citi Custom Cash® Card-7319",
      "Robinhood Credit Card **3640",
      "WELLS FARGO AUTOGRAPH VISA CARD ...2842",
      "Chase Sapphire Mastercard",
      "Amex Platinum",
    ];
    for (const name of names) {
      expect(inferAccountTypeFromName(name)).toBe("credit");
    }
  });

  test("recognizes brokerage and retirement accounts", () => {
    expect(inferAccountTypeFromName("Portfolio Value")).toBe("investment");
    expect(inferAccountTypeFromName("Robinhood traditional IRA")).toBe("investment");
    expect(inferAccountTypeFromName("Fidelity Brokerage")).toBe("investment");
    expect(inferAccountTypeFromName("Roth 401k")).toBe("investment");
  });

  test("recognizes savings and loans", () => {
    expect(inferAccountTypeFromName("Emergency Fund Savings")).toBe("savings");
    expect(inferAccountTypeFromName("Car Loan")).toBe("loan");
    expect(inferAccountTypeFromName("Student Mortgage")).toBe("loan");
  });

  test("falls back to checking when nothing matches", () => {
    expect(inferAccountTypeFromName("Checking-1135")).toBe("checking");
    expect(inferAccountTypeFromName("")).toBe("checking");
    expect(inferAccountTypeFromName("Untitled")).toBe("checking");
  });

  test("does not mistake 'Discover Bank Checking' for a credit card", () => {
    // "Discover" is a card brand but this is plainly a deposit account.
    expect(inferAccountTypeFromName("Discover Bank Checking")).toBe("checking");
  });
});
