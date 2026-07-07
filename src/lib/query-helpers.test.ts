import { describe, test, expect } from "vitest";
import { encodeCursor, decodeCursor } from "./query-helpers";

describe("cursor encode/decode", () => {
  test("round-trips a date + id", () => {
    const cursor = encodeCursor("2026-07-07", "txn_123");
    expect(decodeCursor(cursor)).toEqual({ date: "2026-07-07", id: "txn_123" });
  });

  test("encoded cursor is opaque base64 (no raw delimiters)", () => {
    const cursor = encodeCursor("2026-07-07", "txn_123");
    expect(cursor).not.toContain("2026-07-07");
    expect(() => Buffer.from(cursor, "base64")).not.toThrow();
  });

  test("returns null for non-base64 / non-JSON garbage", () => {
    expect(decodeCursor("!!!not base64!!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  test("returns null when decoded JSON is missing required fields", () => {
    const missingId = Buffer.from(JSON.stringify({ date: "2026-07-07" })).toString("base64");
    const wrongType = Buffer.from(JSON.stringify({ date: 1, id: "x" })).toString("base64");
    expect(decodeCursor(missingId)).toBeNull();
    expect(decodeCursor(wrongType)).toBeNull();
  });
});
