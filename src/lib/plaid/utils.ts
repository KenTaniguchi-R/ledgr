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
