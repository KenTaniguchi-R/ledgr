import { describe, test, expect, vi, afterEach } from "vitest";
import {
  mapPlaidAccountType,
  extractPlaidErrorCode,
  extractPlaidErrorMessage,
  titleCase,
  retryWithBackoff,
  REAUTH_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  SKIP_ERROR_CODES,
} from "./utils";

describe("mapPlaidAccountType", () => {
  test("depository maps to savings only when subtype is savings", () => {
    expect(mapPlaidAccountType("depository", "savings")).toBe("savings");
    expect(mapPlaidAccountType("depository", "checking")).toBe("checking");
    expect(mapPlaidAccountType("depository", null)).toBe("checking");
  });

  test("maps the remaining known types", () => {
    expect(mapPlaidAccountType("credit", null)).toBe("credit");
    expect(mapPlaidAccountType("loan", null)).toBe("loan");
    expect(mapPlaidAccountType("investment", null)).toBe("investment");
  });

  test("unknown type falls back to other", () => {
    expect(mapPlaidAccountType("brokerage", null)).toBe("other");
    expect(mapPlaidAccountType("", null)).toBe("other");
  });
});

describe("extractPlaidErrorCode", () => {
  test("returns the code from a well-formed Plaid error", () => {
    const err = { response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } };
    expect(extractPlaidErrorCode(err)).toBe("ITEM_LOGIN_REQUIRED");
  });

  test("returns null for non-Plaid or malformed shapes", () => {
    expect(extractPlaidErrorCode(null)).toBeNull();
    expect(extractPlaidErrorCode(undefined)).toBeNull();
    expect(extractPlaidErrorCode("boom")).toBeNull();
    expect(extractPlaidErrorCode(new Error("boom"))).toBeNull();
    expect(extractPlaidErrorCode({ response: {} })).toBeNull();
    expect(extractPlaidErrorCode({ response: { data: {} } })).toBeNull();
  });

  test("treats an empty error_code as absent", () => {
    expect(extractPlaidErrorCode({ response: { data: { error_code: "" } } })).toBeNull();
  });
});

describe("extractPlaidErrorMessage", () => {
  test("returns the message when present", () => {
    const err = { response: { data: { error_message: "the item is locked" } } };
    expect(extractPlaidErrorMessage(err)).toBe("the item is locked");
  });

  test("returns undefined for non-Plaid or missing message", () => {
    expect(extractPlaidErrorMessage(null)).toBeUndefined();
    expect(extractPlaidErrorMessage("boom")).toBeUndefined();
    expect(extractPlaidErrorMessage({ response: { data: {} } })).toBeUndefined();
  });
});

describe("titleCase", () => {
  test("trims, lowercases, and capitalizes each word", () => {
    expect(titleCase("  WHOLE FOODS market  ")).toBe("Whole Foods Market");
    expect(titleCase("acme")).toBe("Acme");
  });

  test("capitalizes the first letter following non-word boundaries", () => {
    expect(titleCase("mcdonald's")).toBe("Mcdonald'S");
    expect(titleCase("at&t store")).toBe("At&T Store");
  });

  test("empty string stays empty", () => {
    expect(titleCase("")).toBe("");
  });
});

describe("error-code sets", () => {
  test("classification buckets are disjoint", () => {
    for (const code of REAUTH_ERROR_CODES) {
      expect(TRANSIENT_ERROR_CODES.has(code)).toBe(false);
      expect(SKIP_ERROR_CODES.has(code)).toBe(false);
    }
    for (const code of TRANSIENT_ERROR_CODES) {
      expect(SKIP_ERROR_CODES.has(code)).toBe(false);
    }
  });

  test("known codes land in the expected bucket", () => {
    expect(REAUTH_ERROR_CODES.has("ITEM_LOGIN_REQUIRED")).toBe(true);
    expect(TRANSIENT_ERROR_CODES.has("RATE_LIMIT_EXCEEDED")).toBe(true);
    expect(SKIP_ERROR_CODES.has("PRODUCT_NOT_READY")).toBe(true);
  });
});

describe("retryWithBackoff", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns the value without retrying on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryWithBackoff(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("rethrows non-rate-limit errors immediately", async () => {
    const err = { response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } };
    const fn = vi.fn().mockRejectedValue(err);
    await expect(retryWithBackoff(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries rate-limit errors then succeeds", async () => {
    vi.useFakeTimers();
    const rateLimit = { response: { data: { error_code: "RATE_LIMIT_EXCEEDED" } } };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimit)
      .mockResolvedValueOnce("recovered");

    const promise = retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("gives up after maxAttempts and rethrows", async () => {
    vi.useFakeTimers();
    const rateLimit = { response: { data: { error_code: "RATE_LIMIT_EXCEEDED" } } };
    const fn = vi.fn().mockRejectedValue(rateLimit);

    const promise = retryWithBackoff(fn, 3);
    const assertion = expect(promise).rejects.toBe(rateLimit);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
