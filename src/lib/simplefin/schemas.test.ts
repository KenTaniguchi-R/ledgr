import { describe, it, expect } from "vitest";
import {
  SimplefinAccountsResponseSchema,
  resolveInstitution,
  type SimplefinAccount,
  type SimplefinConnection,
} from "./schemas";

describe("SimplefinAccountsResponseSchema", () => {
  it("parses a protocol v1 response (errors[], no connections)", () => {
    const v1Response = {
      errors: ["You must reauthenticate."],
      accounts: [
        {
          org: { domain: "mybank.com", "sfin-url": "https://sfin.mybank.com" },
          id: "2930002",
          name: "Savings",
          currency: "USD",
          balance: "100.23",
          "available-balance": "75.23",
          "balance-date": 978366153,
          transactions: [],
        },
      ],
    };
    const parsed = SimplefinAccountsResponseSchema.parse(v1Response);
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.errors).toEqual(["You must reauthenticate."]);
  });

  it("parses a protocol v2 response (errlist[], connections[])", () => {
    const v2Response = {
      errlist: [],
      connections: [
        {
          conn_id: "CON-1",
          name: "My Bank - Jeff",
          org_id: "INST-1",
          org_name: "My Bank",
          org_url: "https://mybank.com",
          sfin_url: "https://sfin.mybank.com",
        },
      ],
      accounts: [
        {
          id: "2930002",
          name: "Savings",
          conn_id: "CON-1",
          currency: "USD",
          balance: "100.23",
          "balance-date": 978366153,
          transactions: [
            { id: "txn-1", posted: 793090572, amount: "-33293.43", description: "Uncle Frank's Bait Shop" },
          ],
        },
      ],
    };
    const parsed = SimplefinAccountsResponseSchema.parse(v2Response);
    expect(parsed.connections).toHaveLength(1);
    expect(parsed.accounts[0].transactions).toHaveLength(1);
  });
});

describe("resolveInstitution", () => {
  it("resolves via org for a v1-shaped account", () => {
    const account = {
      id: "acc-1",
      name: "Checking",
      currency: "USD",
      balance: "0",
      "balance-date": 0,
      org: { domain: "mybank.com", name: "My Bank" },
    } as unknown as SimplefinAccount;

    expect(resolveInstitution(account, null)).toEqual({
      externalOrgId: "mybank.com",
      institutionName: "My Bank",
      domain: "mybank.com",
    });
  });

  it("resolves via conn_id + connections[] for a v2-shaped account", () => {
    const account = {
      id: "acc-1",
      name: "Checking",
      currency: "USD",
      balance: "0",
      "balance-date": 0,
      conn_id: "CON-1",
    } as unknown as SimplefinAccount;
    const connections: SimplefinConnection[] = [
      { conn_id: "CON-1", org_name: "My Bank", org_url: "https://www.mybank.com/", sfin_url: "https://sfin.mybank.com" },
    ];

    expect(resolveInstitution(account, connections)).toEqual({
      externalOrgId: "CON-1",
      institutionName: "My Bank",
      domain: "mybank.com",
    });
  });

  it("falls back to unknown when neither org nor conn_id is present", () => {
    const account = {
      id: "acc-1",
      name: "Checking",
      currency: "USD",
      balance: "0",
      "balance-date": 0,
    } as unknown as SimplefinAccount;

    expect(resolveInstitution(account, null)).toEqual({
      externalOrgId: "unknown",
      institutionName: null,
      domain: null,
    });
  });

  it("falls back to the sfin_url host for a v2 connection with no org_url", () => {
    const account = {
      id: "acc-1",
      name: "Checking",
      currency: "USD",
      balance: "0",
      "balance-date": 0,
      conn_id: "CON-1",
    } as unknown as SimplefinAccount;
    const connections: SimplefinConnection[] = [
      { conn_id: "CON-1", org_name: "My Bank", sfin_url: "https://sfin.mybank.com/simplefin" },
    ];

    expect(resolveInstitution(account, connections).domain).toBe("sfin.mybank.com");
  });

  it("returns null domain when the org domain field isn't a valid hostname", () => {
    const account = {
      id: "acc-1",
      name: "Checking",
      currency: "USD",
      balance: "0",
      "balance-date": 0,
      org: { domain: "not a domain", name: "My Bank" },
    } as unknown as SimplefinAccount;

    expect(resolveInstitution(account, null).domain).toBeNull();
  });
});
