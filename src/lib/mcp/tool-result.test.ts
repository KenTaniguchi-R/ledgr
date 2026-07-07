import { describe, test, expect } from "vitest";
import { jsonResult, errorResult } from "./tool-result";

describe("jsonResult", () => {
  test("wraps data as pretty-printed JSON text content", () => {
    const result = jsonResult({ total: 42, items: ["a"] });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ total: 42, items: ["a"] });
    // pretty-printed → contains newlines/indentation
    expect(result.content[0].text).toContain("\n");
    expect(result).not.toHaveProperty("isError");
  });
});

describe("errorResult", () => {
  test("wraps the message in an error envelope flagged isError", () => {
    const result = errorResult("household not found");
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ error: "household not found" });
  });
});
