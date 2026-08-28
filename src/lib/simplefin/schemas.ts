import { z } from "zod";

// SimpleFIN protocol v1/v2: https://www.simplefin.org/protocol.html
// We always request `version=2`, but a server may still respond in v1 shape
// (or a mix), so every version-specific field below is optional.

export const SimplefinTransactionSchema = z.object({
  id: z.string(),
  posted: z.number(),
  amount: z.string(),
  description: z.string(),
  transacted_at: z.number().nullable().optional(),
  pending: z.boolean().nullable().optional(),
  extra: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type SimplefinTransaction = z.infer<typeof SimplefinTransactionSchema>;

// Not in the official spec's Account attribute table, but a widely-supported
// de-facto extension — brokerages (e.g. Robinhood) send this on their
// SimpleFIN accounts even though simplefin.org doesn't document it.
export const SimplefinHoldingSchema = z.object({
  id: z.string(),
  symbol: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  shares: z.string().nullable().optional(),
  market_value: z.string().nullable().optional(),
  cost_basis: z.string().nullable().optional(),
  purchase_price: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  created: z.number().nullable().optional(),
});

export type SimplefinHolding = z.infer<typeof SimplefinHoldingSchema>;

// v1: account.org identifies the institution directly.
export const SimplefinOrganizationSchema = z.object({
  domain: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  id: z.string().nullable().optional(),
  "sfin-url": z.string().nullable().optional(),
});

export type SimplefinOrganization = z.infer<typeof SimplefinOrganizationSchema>;

// v2: a top-level Connection an account points to via conn_id.
export const SimplefinConnectionSchema = z.object({
  conn_id: z.string(),
  name: z.string().nullable().optional(),
  org_id: z.string().nullable().optional(),
  org_name: z.string().nullable().optional(),
  org_url: z.string().nullable().optional(),
  sfin_url: z.string().nullable().optional(),
});

export type SimplefinConnection = z.infer<typeof SimplefinConnectionSchema>;

export const SimplefinAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  balance: z.string(),
  "available-balance": z.string().nullable().optional(),
  "balance-date": z.number(),
  transactions: z.array(SimplefinTransactionSchema).nullable().optional(),
  holdings: z.array(SimplefinHoldingSchema).nullable().optional(),
  extra: z.record(z.string(), z.unknown()).nullable().optional(),
  // v1
  org: SimplefinOrganizationSchema.nullable().optional(),
  // v2
  conn_id: z.string().nullable().optional(),
  conn_name: z.string().nullable().optional(),
});

export type SimplefinAccount = z.infer<typeof SimplefinAccountSchema>;

export const SimplefinErrorSchema = z.object({
  code: z.string().nullable().optional(),
  msg: z.string(),
  conn_id: z.string().nullable().optional(),
});

export type SimplefinError = z.infer<typeof SimplefinErrorSchema>;

export const SimplefinAccountsResponseSchema = z.object({
  accounts: z.array(SimplefinAccountSchema),
  // v1 (deprecated in v2, but some servers still send it)
  errors: z.array(z.string()).nullable().optional(),
  // v2
  errlist: z.array(SimplefinErrorSchema).nullable().optional(),
  connections: z.array(SimplefinConnectionSchema).nullable().optional(),
});

export type SimplefinAccountsResponse = z.infer<typeof SimplefinAccountsResponseSchema>;

/** Resolves an account's institution identity across v1 (`org`) and v2 (`conn_id`/`connections`). */
export function resolveInstitution(
  account: SimplefinAccount,
  connections: SimplefinConnection[] | null | undefined,
): { externalOrgId: string; institutionName: string | null } {
  if (account.conn_id) {
    const conn = connections?.find((c) => c.conn_id === account.conn_id);
    return {
      externalOrgId: account.conn_id,
      institutionName: conn?.org_name ?? conn?.name ?? account.conn_name ?? null,
    };
  }
  if (account.org) {
    return {
      externalOrgId: account.org.domain ?? account.org.id ?? account.org["sfin-url"] ?? "unknown",
      institutionName: account.org.name ?? account.org.domain ?? null,
    };
  }
  return { externalOrgId: "unknown", institutionName: null };
}
