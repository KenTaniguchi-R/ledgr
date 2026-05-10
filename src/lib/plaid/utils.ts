import type { AccountType } from "@/db/schema/accounts";

export function mapPlaidAccountType(
  plaidType: string,
  plaidSubtype: string | null
): AccountType {
  switch (plaidType) {
    case "depository":
      return plaidSubtype === "savings" ? "savings" : "checking";
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    case "investment":
      return "investment";
    default:
      return "other";
  }
}

export { todayDateString as todayISO, nowISO } from "@/lib/date-utils";

export function extractPlaidErrorCode(err: unknown): string | null {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    (err as { response?: { data?: { error_code?: string } } }).response?.data
      ?.error_code
  ) {
    return (err as { response: { data: { error_code: string } } }).response.data
      .error_code;
  }
  return null;
}

export function titleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractPlaidErrorMessage(err: unknown): string | undefined {
  if (
    err &&
    typeof err === "object" &&
    "response" in err
  ) {
    return (err as { response?: { data?: { error_message?: string } } }).response?.data?.error_message;
  }
  return undefined;
}

// ─── Shared sync utilities ──────────────────────────────────────────────────

export const REAUTH_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "ITEM_LOCKED",
  "USER_SETUP_REQUIRED",
  "MFA_NOT_SUPPORTED",
  "INSUFFICIENT_CREDENTIALS",
]);

export const TRANSIENT_ERROR_CODES = new Set([
  "INSTITUTION_DOWN",
  "INSTITUTION_NOT_RESPONDING",
  "INSTITUTION_NOT_AVAILABLE",
  "TRANSACTIONS_LIMIT",
  "RATE_LIMIT_EXCEEDED",
  "INTERNAL_SERVER_ERROR",
]);

export const SKIP_ERROR_CODES = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_READY",
]);

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const errorCode = extractPlaidErrorCode(err);
      if (errorCode !== "RATE_LIMIT_EXCEEDED" || attempt === maxAttempts) {
        throw err;
      }
      const baseDelay = Math.pow(2, attempt) * 500;
      const jitter = Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    }
  }
  throw new Error("retryWithBackoff exhausted");
}
