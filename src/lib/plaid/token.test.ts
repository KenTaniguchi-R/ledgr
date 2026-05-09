import { describe, it, expect } from "vitest";
import { encryptAccessToken, decryptAccessToken } from "./token";

describe("plaid token encryption", () => {
  it("round-trips: decrypt(encrypt(token)) === token", () => {
    const token = "access-sandbox-abc123-def456";
    const encrypted = encryptAccessToken(token);
    const decrypted = decryptAccessToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const token = "access-sandbox-abc123-def456";
    const a = encryptAccessToken(token);
    const b = encryptAccessToken(token);
    expect(a).not.toBe(b);
  });
});
