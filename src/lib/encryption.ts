import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION_PREFIX = /^v(\d+):/;

function keyEnvName(version: number): string {
  return version === 1 ? "ENCRYPTION_KEY" : `ENCRYPTION_KEY_V${version}`;
}

function getKeyForVersion(version: number): Buffer {
  const key = process.env[keyEnvName(version)];
  if (!key) {
    if (version === 1) {
      throw new Error("ENCRYPTION_KEY environment variable is required");
    }
    throw new Error(
      `Unknown encryption key version "v${version}" — is ${keyEnvName(version)} set?`
    );
  }
  return Buffer.from(key, "hex");
}

/** Highest configured key version — the version all new encryptions use. */
function activeVersion(): number {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }
  let version = 1;
  for (const name of Object.keys(process.env)) {
    const match = /^ENCRYPTION_KEY_V(\d+)$/.exec(name);
    if (match && process.env[name]) version = Math.max(version, Number(match[1]));
  }
  return version;
}

/** Splits "vN:payload" into its parts. Unprefixed ciphertext is legacy v1. */
function parseCiphertext(ciphertext: string): { version: number; payload: string } {
  const match = VERSION_PREFIX.exec(ciphertext);
  if (!match) return { version: 1, payload: ciphertext };
  return { version: Number(match[1]), payload: ciphertext.slice(match[0].length) };
}

export function encrypt(plaintext: string): string {
  const version = activeVersion();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKeyForVersion(version), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");
  return `v${version}:${payload}`;
}

export function decrypt(ciphertext: string): string {
  const { version, payload } = parseCiphertext(ciphertext);
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKeyForVersion(version), iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/** True when the ciphertext was written with an older key than the active one. */
export function needsRotation(ciphertext: string): boolean {
  return parseCiphertext(ciphertext).version < activeVersion();
}
