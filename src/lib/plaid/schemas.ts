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

// ─── Recurring Streams ──────────────────────────────────────────────────────

export const PlaidStreamAmountSchema = z.object({
  amount: z.number().nullable(),
  iso_currency_code: z.string().nullable().optional(),
  unofficial_currency_code: z.string().nullable().optional(),
});

export const PlaidRecurringStreamSchema = z
  .object({
    stream_id: z.string(),
    account_id: z.string(),
    description: z.string(),
    merchant_name: z.string().nullable(),
    first_date: z.string(),
    last_date: z.string(),
    predicted_next_date: z.string().nullable(),
    average_amount: PlaidStreamAmountSchema,
    last_amount: PlaidStreamAmountSchema,
    frequency: z.enum([
      "WEEKLY",
      "BIWEEKLY",
      "SEMI_MONTHLY",
      "MONTHLY",
      "ANNUALLY",
      "UNKNOWN",
    ]),
    is_active: z.boolean(),
    transaction_ids: z.array(z.string()),
    personal_finance_category: z
      .object({
        primary: z.string(),
        detailed: z.string(),
        confidence_level: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    category: z.array(z.string()).nullable().optional(),
    status: z
      .enum(["MATURE", "EARLY_DETECTION", "TOMBSTONED", "UNKNOWN"])
      .optional(),
  })
  .passthrough();

export type PlaidRecurringStream = z.infer<typeof PlaidRecurringStreamSchema>;

export const PlaidRecurringResponseSchema = z.object({
  inflow_streams: z.array(PlaidRecurringStreamSchema),
  outflow_streams: z.array(PlaidRecurringStreamSchema),
  request_id: z.string(),
});

export type PlaidRecurringResponse = z.infer<
  typeof PlaidRecurringResponseSchema
>;
