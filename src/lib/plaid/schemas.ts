import { z } from "zod";

export const PlaidTransactionSchema = z.object({
  transaction_id: z.string(),
  account_id: z.string(),
  amount: z.number(),
  iso_currency_code: z.string().nullable(),
  date: z.string(),
  name: z.string(),
  merchant_name: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  pending: z.boolean(),
  pending_transaction_id: z.string().nullable().optional(),
  personal_finance_category: z
    .object({
      primary: z.string(),
      detailed: z.string(),
    })
    .nullable()
    .optional(),
});

export type PlaidTransaction = z.infer<typeof PlaidTransactionSchema>;

export const PlaidRemovedTransactionSchema = z.object({
  transaction_id: z.string(),
});

export type PlaidRemovedTransaction = z.infer<typeof PlaidRemovedTransactionSchema>;

export const PlaidAccountBalancesSchema = z.object({
  account_id: z.string(),
  balances: z.object({
    current: z.number().nullable(),
    available: z.number().nullable(),
    limit: z.number().nullable(),
    iso_currency_code: z.string().nullable(),
  }),
});

export const PlaidSyncResponseSchema = z.object({
  added: z.array(PlaidTransactionSchema),
  modified: z.array(PlaidTransactionSchema),
  removed: z.array(PlaidRemovedTransactionSchema),
  has_more: z.boolean(),
  next_cursor: z.string(),
  accounts: z.array(PlaidAccountBalancesSchema).optional(),
  request_id: z.string().optional(),
});

export type PlaidSyncResponse = z.infer<typeof PlaidSyncResponseSchema>;

export const WebhookPayloadSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string(),
  error: z
    .object({
      error_type: z.string(),
      error_code: z.string(),
      error_message: z.string(),
    })
    .nullable()
    .optional(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
