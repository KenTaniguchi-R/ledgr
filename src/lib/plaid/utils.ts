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

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}
