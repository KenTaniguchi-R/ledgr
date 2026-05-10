import { jwtVerify, importJWK, decodeProtectedHeader, type JWTPayload } from "jose";
import { createHash } from "node:crypto";
import { getPlaidClient } from "./client";
import { WebhookPayloadSchema, type WebhookPayload } from "./schemas";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

interface CachedKey {
  key: CryptoKey;
  expiresAt: number;
}

const MAX_CACHE_SIZE = 10;
const TTL_MS = 5 * 60 * 1000;

const jwkCache = new Map<string, CachedKey>();
const inflight = new Map<string, Promise<CryptoKey>>();

export function clearJwkCache() {
  jwkCache.clear();
  inflight.clear();
}

async function fetchJwk(kid: string): Promise<CryptoKey> {
  const pending = inflight.get(kid);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const client = getPlaidClient();
      const res = await client.webhookVerificationKeyGet({ key_id: kid });
      const jwk = res.data.key;
      const cryptoKey = await importJWK(
        { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
        jwk.alg,
      );

      if (jwkCache.size >= MAX_CACHE_SIZE) {
        const oldest = jwkCache.keys().next().value!;
        jwkCache.delete(oldest);
      }

      jwkCache.set(kid, { key: cryptoKey as CryptoKey, expiresAt: Date.now() + TTL_MS });
      return cryptoKey as CryptoKey;
    } finally {
      inflight.delete(kid);
    }
  })();

  inflight.set(kid, promise);
  return promise;
}

async function getKey(kid: string): Promise<CryptoKey> {
  const cached = jwkCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }
  jwkCache.delete(kid);
  return fetchJwk(kid);
}

async function verify(rawBody: string, token: string): Promise<WebhookPayload> {
  const header = decodeProtectedHeader(token);
  if (!header.kid) {
    throw new WebhookVerificationError("JWT missing kid header");
  }

  const key = await getKey(header.kid);
  const { payload } = await jwtVerify(token, key);

  const iat = (payload as JWTPayload).iat;
  if (!iat || Math.floor(Date.now() / 1000) - iat > 300) {
    throw new WebhookVerificationError("JWT iat is stale (replay protection)");
  }

  const expectedHash = (payload as Record<string, unknown>).request_body_sha256;
  const actualHash = createHash("sha256").update(rawBody).digest("hex");
  if (expectedHash !== actualHash) {
    throw new WebhookVerificationError("Body hash mismatch");
  }

  const body = JSON.parse(rawBody);
  return WebhookPayloadSchema.parse(body);
}

export async function verifyWebhookSignature(
  rawBody: string,
  plaidVerificationHeader: string,
): Promise<WebhookPayload> {
  try {
    return await verify(rawBody, plaidVerificationHeader);
  } catch (err) {
    if (err instanceof WebhookVerificationError) throw err;

    // Retry once with fresh key (handles key rotation)
    try {
      const header = decodeProtectedHeader(plaidVerificationHeader);
      if (header.kid) {
        jwkCache.delete(header.kid);
        inflight.delete(header.kid);
      }
      return await verify(rawBody, plaidVerificationHeader);
    } catch (retryErr) {
      if (retryErr instanceof WebhookVerificationError) throw retryErr;
      throw new WebhookVerificationError(
        `Webhook verification failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }
}
