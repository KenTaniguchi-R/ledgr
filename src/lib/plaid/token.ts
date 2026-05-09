import { encrypt, decrypt } from "@/lib/encryption";

export function encryptAccessToken(rawToken: string): string {
  return encrypt(rawToken);
}

export function decryptAccessToken(storedToken: string): string {
  return decrypt(storedToken);
}
