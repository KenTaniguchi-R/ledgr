import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, needsRotation } from "./encryption";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("encryption", () => {
  it("round-trips a simple string", () => {
    const plaintext = "access-sandbox-abc123";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode characters", () => {
    const plaintext = "こんにちは世界 🔐";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("handles long strings", () => {
    const plaintext = "a".repeat(10000);
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("fails to decrypt with wrong key", () => {
    const plaintext = "secret-token";
    const encrypted = encrypt(plaintext);
    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
    expect(() => decrypt(encrypted)).toThrow();
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it("fails to decrypt tampered ciphertext", () => {
    const encrypted = encrypt("test-data");
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY environment variable is required");
    process.env.ENCRYPTION_KEY = originalKey;
  });
});

describe("key versioning", () => {
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY_V2;
    delete process.env.ENCRYPTION_KEY_V3;
  });

  it("prefixes new ciphertext with the active key version", () => {
    expect(encrypt("token")).toMatch(/^v1:/);
    process.env.ENCRYPTION_KEY_V2 = randomBytes(32).toString("hex");
    expect(encrypt("token")).toMatch(/^v2:/);
  });

  it("decrypts legacy unprefixed ciphertext with ENCRYPTION_KEY (regression)", () => {
    // Legacy format is byte-identical to the v1 payload — strip the prefix
    // to reproduce ciphertext written by the pre-versioning code.
    const legacy = encrypt("access-prod-legacy").replace(/^v1:/, "");
    expect(legacy).not.toMatch(/^v/);
    expect(decrypt(legacy)).toBe("access-prod-legacy");
  });

  it("decrypts old-version ciphertext after a new key is added", () => {
    const v1Ciphertext = encrypt("survives-rotation");
    process.env.ENCRYPTION_KEY_V2 = randomBytes(32).toString("hex");
    expect(decrypt(v1Ciphertext)).toBe("survives-rotation");
  });

  it("throws a configuration error for an unconfigured version", () => {
    process.env.ENCRYPTION_KEY_V2 = randomBytes(32).toString("hex");
    const v2Ciphertext = encrypt("needs-v2");
    delete process.env.ENCRYPTION_KEY_V2;
    expect(() => decrypt(v2Ciphertext)).toThrow(
      'Unknown encryption key version "v2" — is ENCRYPTION_KEY_V2 set?'
    );
  });

  it("needsRotation is true only for ciphertext older than the active version", () => {
    const v1Ciphertext = encrypt("rotate-me");
    expect(needsRotation(v1Ciphertext)).toBe(false);
    process.env.ENCRYPTION_KEY_V2 = randomBytes(32).toString("hex");
    expect(needsRotation(v1Ciphertext)).toBe(true);
    expect(needsRotation(encrypt("fresh"))).toBe(false);
    // legacy unprefixed counts as v1
    expect(needsRotation(v1Ciphertext.replace(/^v1:/, ""))).toBe(true);
  });

  test.prop([fc.string()])("round-trips arbitrary strings (single key)", (s) => {
    expect(decrypt(encrypt(s))).toBe(s);
  });

  test.prop([fc.string()])("round-trips arbitrary strings (multi-key)", (s) => {
    process.env.ENCRYPTION_KEY_V2 = randomBytes(32).toString("hex");
    try {
      expect(decrypt(encrypt(s))).toBe(s);
    } finally {
      delete process.env.ENCRYPTION_KEY_V2;
    }
  });
});
