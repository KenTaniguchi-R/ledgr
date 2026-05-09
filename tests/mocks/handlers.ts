import { http, HttpResponse } from "msw";

export const plaidHandlers = [
  http.post("https://sandbox.plaid.com/link/token/create", () =>
    HttpResponse.json({
      link_token: "link-sandbox-test-token",
      expiration: "2026-12-31T00:00:00Z",
      request_id: "req-test-123",
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
          account_id: "plaid-acc-1",
          name: "Plaid Checking",
          official_name: "Plaid Gold Standard Checking",
          type: "depository",
          subtype: "checking",
          balances: {
            current: 1000.0,
            available: 900.0,
            iso_currency_code: "USD",
          },
        },
      ],
      request_id: "req-test-789",
    })
  ),
];

export const allHandlers = [...plaidHandlers];
