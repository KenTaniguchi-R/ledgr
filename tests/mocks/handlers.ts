import { http, HttpResponse } from "msw";

export const plaidHandlers = [
  http.post("https://sandbox.plaid.com/link/token/create", () =>
    HttpResponse.json({
      link_token: "link-sandbox-test-token",
      expiration: "2026-12-31T00:00:00Z",
      request_id: "req-test-123",
    })
  ),

  http.post("https://sandbox.plaid.com/item/public_token/exchange", () =>
    HttpResponse.json({
      access_token: "access-sandbox-test-token-abc123",
      item_id: "plaid-item-1",
      request_id: "req-test-exchange",
    })
  ),

  http.post("https://sandbox.plaid.com/item/get", () =>
    HttpResponse.json({
      item: {
        item_id: "plaid-item-1",
        institution_id: "ins_1",
        webhook: "",
        available_products: ["transactions"],
        billed_products: ["transactions"],
        consent_expiration_time: null,
        error: null,
      },
      request_id: "req-test-item-get",
    })
  ),

  http.post("https://sandbox.plaid.com/institutions/get_by_id", () =>
    HttpResponse.json({
      institution: {
        institution_id: "ins_1",
        name: "Chase",
        products: ["transactions"],
        country_codes: ["US"],
      },
      request_id: "req-test-inst",
    })
  ),

  http.post("https://sandbox.plaid.com/transactions/sync", () =>
    HttpResponse.json({
      added: [],
      modified: [],
      removed: [],
      has_more: false,
      next_cursor: "cursor_abc123",
      request_id: "req-test-456",
    })
  ),

  http.post("https://sandbox.plaid.com/accounts/get", () =>
    HttpResponse.json({
      accounts: [
        {
          account_id: "plaid-acc-checking",
          name: "Plaid Checking",
          official_name: "Plaid Gold Standard Checking",
          type: "depository",
          subtype: "checking",
          mask: "0000",
          balances: {
            current: 1000.0,
            available: 900.0,
            limit: null,
            iso_currency_code: "USD",
          },
        },
        {
          account_id: "plaid-acc-savings",
          name: "Plaid Saving",
          official_name: "Plaid Silver Standard Savings",
          type: "depository",
          subtype: "savings",
          mask: "1111",
          balances: {
            current: 5000.0,
            available: 5000.0,
            limit: null,
            iso_currency_code: "USD",
          },
        },
        {
          account_id: "plaid-acc-credit",
          name: "Plaid Credit Card",
          official_name: "Plaid Diamond Credit Card",
          type: "credit",
          subtype: "credit card",
          mask: "2222",
          balances: {
            current: 450.5,
            available: 549.5,
            limit: 1000.0,
            iso_currency_code: "USD",
          },
        },
        {
          account_id: "plaid-acc-null",
          name: "Plaid Investment",
          official_name: null,
          type: "investment",
          subtype: "401k",
          mask: "3333",
          balances: {
            current: null,
            available: null,
            limit: null,
            iso_currency_code: "USD",
          },
        },
      ],
      request_id: "req-test-789",
    })
  ),
];

// Shared test constants for transaction IDs
export const TEST_TXN_IDS = {
  added1: "txn-added-1",
  added2: "txn-added-2",
  pending1: "txn-pending-1",
  posted1: "txn-posted-1",
  modified1: "txn-modified-1",
  removed1: "txn-removed-1",
} as const;

export const syncPageOneHandler = http.post(
  "https://sandbox.plaid.com/transactions/sync",
  () =>
    HttpResponse.json({
      added: [
        {
          transaction_id: TEST_TXN_IDS.added1,
          account_id: "plaid-acc-checking",
          amount: 12.5,
          iso_currency_code: "USD",
          date: "2026-05-01",
          name: "AMAZON.COM*1A2B3C",
          merchant_name: "Amazon",
          logo_url: "https://plaid-merchant-logos.plaid.com/amazon.png",
          pending: false,
          pending_transaction_id: null,
          personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES" },
        },
        {
          transaction_id: TEST_TXN_IDS.added2,
          account_id: "plaid-acc-checking",
          amount: -500.0,
          iso_currency_code: "USD",
          date: "2026-05-02",
          name: "DIRECT DEPOSIT - EMPLOYER",
          merchant_name: null,
          logo_url: null,
          pending: false,
          pending_transaction_id: null,
          personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES" },
        },
        {
          transaction_id: TEST_TXN_IDS.pending1,
          account_id: "plaid-acc-checking",
          amount: 35.99,
          iso_currency_code: "USD",
          date: "2026-05-03",
          name: "UBER *TRIP",
          merchant_name: "Uber",
          logo_url: null,
          pending: true,
          pending_transaction_id: null,
          personal_finance_category: { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" },
        },
      ],
      modified: [],
      removed: [],
      has_more: true,
      next_cursor: "cursor_page2",
      request_id: "req-sync-page1",
    })
);

export const syncPageTwoHandler = http.post(
  "https://sandbox.plaid.com/transactions/sync",
  () =>
    HttpResponse.json({
      added: [
        {
          transaction_id: TEST_TXN_IDS.posted1,
          account_id: "plaid-acc-checking",
          amount: 35.99,
          iso_currency_code: "USD",
          date: "2026-05-03",
          name: "UBER *TRIP",
          merchant_name: "Uber",
          logo_url: null,
          pending: false,
          pending_transaction_id: TEST_TXN_IDS.pending1,
          personal_finance_category: { primary: "TRANSPORTATION", detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" },
        },
      ],
      modified: [],
      removed: [],
      has_more: false,
      next_cursor: "cursor_final",
      request_id: "req-sync-page2",
    })
);

export const syncWithModifiedHandler = http.post(
  "https://sandbox.plaid.com/transactions/sync",
  () =>
    HttpResponse.json({
      added: [],
      modified: [
        {
          transaction_id: TEST_TXN_IDS.modified1,
          account_id: "plaid-acc-checking",
          amount: 25.0,
          iso_currency_code: "USD",
          date: "2026-05-01",
          name: "AMAZON.COM REFUND",
          merchant_name: "Amazon",
          logo_url: null,
          pending: false,
          pending_transaction_id: null,
          personal_finance_category: null,
        },
      ],
      removed: [],
      has_more: false,
      next_cursor: "cursor_modified",
      request_id: "req-sync-modified",
    })
);

export const syncWithRemovedHandler = http.post(
  "https://sandbox.plaid.com/transactions/sync",
  () =>
    HttpResponse.json({
      added: [],
      modified: [],
      removed: [{ transaction_id: TEST_TXN_IDS.removed1 }],
      has_more: false,
      next_cursor: "cursor_removed",
      request_id: "req-sync-removed",
    })
);

export const syncEmptyHandler = http.post(
  "https://sandbox.plaid.com/transactions/sync",
  () =>
    HttpResponse.json({
      added: [],
      modified: [],
      removed: [],
      has_more: false,
      next_cursor: "cursor_empty",
      request_id: "req-sync-empty",
    })
);

export const webhookKeyHandler = http.post(
  "https://sandbox.plaid.com/webhook_verification_key/get",
  () =>
    HttpResponse.json({
      key: {
        alg: "ES256",
        crv: "P-256",
        kid: "test-key-1",
        kty: "EC",
        use: "sig",
        x: "mock-x-coordinate",
        y: "mock-y-coordinate",
        created_at: 1700000000,
        expired_at: null,
      },
      request_id: "req-key-test",
    })
);

export const TEST_STREAM_IDS = {
  netflix: "stream-netflix-1",
  salary: "stream-salary-1",
  gym: "stream-gym-1",
} as const;

export const recurringGetHandler = http.post(
  "https://sandbox.plaid.com/transactions/recurring/get",
  () =>
    HttpResponse.json({
      inflow_streams: [
        {
          stream_id: TEST_STREAM_IDS.salary,
          account_id: "plaid-acc-checking",
          description: "DIRECT DEPOSIT EMPLOYER",
          merchant_name: null,
          first_date: "2025-01-15",
          last_date: "2026-04-15",
          predicted_next_date: "2026-05-15",
          average_amount: { amount: -3000.0, iso_currency_code: "USD", unofficial_currency_code: null },
          last_amount: { amount: -3000.0, iso_currency_code: "USD", unofficial_currency_code: null },
          frequency: "MONTHLY",
          is_active: true,
          transaction_ids: [TEST_TXN_IDS.added2],
          personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES", confidence_level: "VERY_HIGH" },
          status: "MATURE",
        },
      ],
      outflow_streams: [
        {
          stream_id: TEST_STREAM_IDS.netflix,
          account_id: "plaid-acc-checking",
          description: "NETFLIX.COM",
          merchant_name: "Netflix",
          first_date: "2025-06-01",
          last_date: "2026-04-01",
          predicted_next_date: "2026-05-01",
          average_amount: { amount: 15.99, iso_currency_code: "USD", unofficial_currency_code: null },
          last_amount: { amount: 15.99, iso_currency_code: "USD", unofficial_currency_code: null },
          frequency: "MONTHLY",
          is_active: true,
          transaction_ids: [],
          personal_finance_category: { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES", confidence_level: "VERY_HIGH" },
          status: "MATURE",
        },
        {
          stream_id: TEST_STREAM_IDS.gym,
          account_id: "plaid-acc-checking",
          description: "PLANET FITNESS",
          merchant_name: "Planet Fitness",
          first_date: "2025-03-01",
          last_date: "2026-04-01",
          predicted_next_date: "2026-05-01",
          average_amount: { amount: 25.0, iso_currency_code: "USD", unofficial_currency_code: null },
          last_amount: { amount: 25.0, iso_currency_code: "USD", unofficial_currency_code: null },
          frequency: "MONTHLY",
          is_active: true,
          transaction_ids: [],
          personal_finance_category: null,
          status: "MATURE",
        },
      ],
      request_id: "req-recurring-test",
    })
);

export const recurringEmptyHandler = http.post(
  "https://sandbox.plaid.com/transactions/recurring/get",
  () =>
    HttpResponse.json({
      inflow_streams: [],
      outflow_streams: [],
      request_id: "req-recurring-empty",
    })
);

export const recurringErrorHandler = http.post(
  "https://sandbox.plaid.com/transactions/recurring/get",
  () =>
    HttpResponse.json(
      { error_type: "INVALID_REQUEST", error_code: "PRODUCT_NOT_READY", error_message: "Recurring not ready" },
      { status: 400 }
    )
);

export const allHandlers = [...plaidHandlers, webhookKeyHandler];
