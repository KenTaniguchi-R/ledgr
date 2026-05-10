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

export const allHandlers = [...plaidHandlers];
