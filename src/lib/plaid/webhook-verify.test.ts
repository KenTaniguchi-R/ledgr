import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createHash } from "node:crypto";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/mocks/server";
import { resetPlaidClient } from "./client";

const TEST_BODY = JSON.stringify({
  webhook_type: "TRANSACTIONS",
  webhook_code: "SYNC_UPDATES_AVAILABLE",
  item_id: "test-item-123",
});

const bodyHash = createHash("sha256").update(TEST_BODY).digest("hex");

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;
const TEST_KID = "test-key-id-1";

beforeAll(async () => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");

  const keyPair = await generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  const jwk = await exportJWK(keyPair.publicKey);
  publicJwk = {
    ...jwk,
    kid: TEST_KID,
    alg: "ES256",
    use: "sig",
    created_at: Math.floor(Date.now() / 1000) - 60,
    expired_at: null,
  };

  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

afterEach(() => {
  server.resetHandlers();
  resetPlaidClient();
});

async function createTestJwt(body: string, opts?: { iat?: number }): Promise<string> {
  const hash = createHash("sha256").update(body).digest("hex");
  const iat = opts?.iat ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ request_body_sha256: hash, iat })
    .setProtectedHeader({ alg: "ES256", kid: TEST_KID, typ: "JWT" })
    .setIssuedAt(iat)
    .sign(privateKey);
}

function mockWebhookKeyEndpoint() {
  server.use(
    http.post("https://sandbox.plaid.com/webhook_verification_key/get", () =>
      HttpResponse.json({ key: publicJwk, request_id: "req-key-1" })
    )
  );
}

describe("verifyWebhookSignature", () => {
  it("returns parsed payload for valid signature and body hash", async () => {
    const { verifyWebhookSignature, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    const jwt = await createTestJwt(TEST_BODY);
    const result = await verifyWebhookSignature(TEST_BODY, jwt);

    expect(result).toEqual({
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: "test-item-123",
    });
  });

  it("throws WebhookVerificationError on tampered body", async () => {
    const { verifyWebhookSignature, WebhookVerificationError, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    const jwt = await createTestJwt(TEST_BODY);
    const tamperedBody = JSON.stringify({ webhook_type: "EVIL", webhook_code: "HACK", item_id: "x" });

    await expect(verifyWebhookSignature(tamperedBody, jwt)).rejects.toThrow(WebhookVerificationError);
  });

  it("throws on stale iat (replay protection)", async () => {
    const { verifyWebhookSignature, WebhookVerificationError, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    const staleIat = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const jwt = await createTestJwt(TEST_BODY, { iat: staleIat });

    await expect(verifyWebhookSignature(TEST_BODY, jwt)).rejects.toThrow(WebhookVerificationError);
  });

  it("throws on invalid JWT signature", async () => {
    const { verifyWebhookSignature, WebhookVerificationError, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();
    mockWebhookKeyEndpoint();

    await expect(verifyWebhookSignature(TEST_BODY, "invalid.jwt.token")).rejects.toThrow(WebhookVerificationError);
  });

  it("retries with fresh key on verification failure (key rotation)", async () => {
    const { verifyWebhookSignature, clearJwkCache } = await import("./webhook-verify");
    clearJwkCache();

    // First call: return an old key. Second call: return the correct key.
    const oldKeyPair = await generateKeyPair("ES256");
    const oldJwk = await exportJWK(oldKeyPair.publicKey);
    let callCount = 0;

    server.use(
      http.post("https://sandbox.plaid.com/webhook_verification_key/get", () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            key: { ...oldJwk, kid: TEST_KID, alg: "ES256", use: "sig", created_at: 1, expired_at: null },
            request_id: "req-old",
          });
        }
        return HttpResponse.json({ key: publicJwk, request_id: "req-new" });
      })
    );

    const jwt = await createTestJwt(TEST_BODY);
    const result = await verifyWebhookSignature(TEST_BODY, jwt);

    expect(result.item_id).toBe("test-item-123");
    expect(callCount).toBe(2);
  });
});
