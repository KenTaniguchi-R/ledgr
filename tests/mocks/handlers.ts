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
  removed2: "txn-removed-2",
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

// ─── Investment Mock Handlers ───────────────────────────────────────────────

export const TEST_SECURITY_IDS = {
  aapl: "sec-aapl",
  voo: "sec-voo",
  btc: "sec-btc",
  warrant: "sec-warrant",
} as const;

export const investmentsHoldingsGetHandler = http.post(
  "https://sandbox.plaid.com/investments/holdings/get",
  () =>
    HttpResponse.json({
      accounts: [
        {
          account_id: "plaid-acc-null",
          name: "Plaid IRA",
          type: "investment",
          subtype: "ira",
          mask: "5555",
          balances: { current: 23000.0, available: null, limit: null, iso_currency_code: "USD" },
        },
      ],
      holdings: [
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.aapl,
          quantity: 10,
          institution_price: 150.0,
          institution_price_as_of: "2026-05-10",
          institution_value: 1500.0,
          cost_basis: 1200.0,
          iso_currency_code: "USD",
        },
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.voo,
          quantity: 5,
          institution_price: 400.0,
          institution_price_as_of: "2026-05-10",
          institution_value: 2000.0,
          cost_basis: null,
          iso_currency_code: "USD",
        },
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.btc,
          quantity: 0.5,
          institution_price: 60000.0,
          institution_price_as_of: "2026-05-10",
          institution_value: 30000.0,
          cost_basis: 25000.0,
          iso_currency_code: "USD",
        },
        {
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.warrant,
          quantity: 100,
          institution_price: 2.0,
          institution_price_as_of: null,
          institution_value: 200.0,
          cost_basis: 150.0,
          iso_currency_code: "USD",
        },
      ],
      securities: [
        {
          security_id: TEST_SECURITY_IDS.aapl,
          name: "Apple Inc",
          ticker_symbol: "AAPL",
          type: "equity",
          iso_currency_code: "USD",
          close_price: 150.0,
          sector: "Technology",
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.voo,
          name: "Vanguard S&P 500 ETF",
          ticker_symbol: "VOO",
          type: "etf",
          iso_currency_code: "USD",
          close_price: 400.0,
          sector: null,
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.btc,
          name: "Bitcoin",
          ticker_symbol: "BTC",
          type: "cryptocurrency",
          iso_currency_code: "USD",
          close_price: 60000.0,
          sector: null,
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.warrant,
          name: "Some Warrant XYZ",
          ticker_symbol: null,
          type: "warrant",
          iso_currency_code: "USD",
          close_price: 2.0,
          sector: null,
          is_cash_equivalent: false,
        },
      ],
      request_id: "req-inv-holdings",
    })
);

export const investmentsHoldingsEmptyHandler = http.post(
  "https://sandbox.plaid.com/investments/holdings/get",
  () =>
    HttpResponse.json({
      accounts: [],
      holdings: [],
      securities: [],
      request_id: "req-inv-holdings-empty",
    })
);

export const investmentsTransactionsPageOneHandler = http.post(
  "https://sandbox.plaid.com/investments/transactions/get",
  () =>
    HttpResponse.json({
      investment_transactions: [
        {
          investment_transaction_id: "inv-txn-buy-aapl",
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.aapl,
          date: "2026-04-15",
          name: "Buy AAPL",
          quantity: 10,
          amount: 1500.0,
          price: 150.0,
          fees: 4.95,
          type: "buy",
          subtype: "buy",
          iso_currency_code: "USD",
        },
        {
          investment_transaction_id: "inv-txn-div-voo",
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.voo,
          date: "2026-04-20",
          name: "Dividend VOO",
          quantity: 0,
          amount: -25.0,
          price: 0,
          fees: 0,
          type: "cash",
          subtype: "dividend",
          iso_currency_code: "USD",
        },
      ],
      securities: [
        {
          security_id: TEST_SECURITY_IDS.aapl,
          name: "Apple Inc",
          ticker_symbol: "AAPL",
          type: "equity",
          iso_currency_code: "USD",
          close_price: 150.0,
          sector: "Technology",
          is_cash_equivalent: false,
        },
        {
          security_id: TEST_SECURITY_IDS.voo,
          name: "Vanguard S&P 500 ETF",
          ticker_symbol: "VOO",
          type: "etf",
          iso_currency_code: "USD",
          close_price: 400.0,
          sector: null,
          is_cash_equivalent: false,
        },
      ],
      total_investment_transactions: 3,
      request_id: "req-inv-txns-page1",
    })
);

export const investmentsTransactionsPageTwoHandler = http.post(
  "https://sandbox.plaid.com/investments/transactions/get",
  () =>
    HttpResponse.json({
      investment_transactions: [
        {
          investment_transaction_id: "inv-txn-sell-aapl",
          account_id: "plaid-acc-null",
          security_id: TEST_SECURITY_IDS.aapl,
          date: "2026-05-01",
          name: "Sell AAPL",
          quantity: -5,
          amount: -800.0,
          price: 160.0,
          fees: 4.95,
          type: "sell",
          subtype: "sell",
          iso_currency_code: "USD",
        },
      ],
      securities: [
        {
          security_id: TEST_SECURITY_IDS.aapl,
          name: "Apple Inc",
          ticker_symbol: "AAPL",
          type: "equity",
          iso_currency_code: "USD",
          close_price: 160.0,
          sector: "Technology",
          is_cash_equivalent: false,
        },
      ],
      total_investment_transactions: 3,
      request_id: "req-inv-txns-page2",
    })
);

export const investmentsProductsNotSupportedHandler = http.post(
  "https://sandbox.plaid.com/investments/holdings/get",
  () =>
    HttpResponse.json(
      {
        error_type: "INVALID_REQUEST",
        error_code: "PRODUCTS_NOT_SUPPORTED",
        error_message: "the products specified are not supported by this institution",
      },
      { status: 400 }
    )
);
