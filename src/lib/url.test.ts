import { describe, it, expect } from "vitest";
import { sanitizeCallbackUrl } from "./url";

describe("sanitizeCallbackUrl", () => {
  it("returns the URL for valid relative paths", () => {
    expect(sanitizeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/transactions?page=2")).toBe("/transactions?page=2");
  });

  it("returns / for null or empty input", () => {
    expect(sanitizeCallbackUrl(null)).toBe("/");
    expect(sanitizeCallbackUrl("")).toBe("/");
  });

  it("rejects absolute URLs (open redirect)", () => {
    expect(sanitizeCallbackUrl("https://evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("http://evil.com")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeCallbackUrl("//evil.com")).toBe("/");
  });

  it("returns / for paths not starting with /", () => {
    expect(sanitizeCallbackUrl("dashboard")).toBe("/");
  });
});
