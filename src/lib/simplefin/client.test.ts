import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import { claimSetupToken, parseAccessUrl, simplefinRequest, SimplefinHttpError } from "./client";

// Every test host in this file resolves to a public IP unless a test
// overrides it — keeps DNS fully mocked so these tests never touch the
// network and stay deterministic regardless of the real bridge.simplefin.org.
beforeEach(() => {
  lookupMock.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
});

describe("parseAccessUrl", () => {
  it("splits Basic Auth credentials out of the Access URL into a header", () => {
    const { baseUrl, authHeader } = parseAccessUrl("https://user123:pass456@bridge.simplefin.org/simplefin");
    expect(baseUrl).toBe("https://bridge.simplefin.org/simplefin");
    expect(authHeader).toBe(`Basic ${Buffer.from("user123:pass456").toString("base64")}`);
  });
});

describe("claimSetupToken", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("decodes the base64 token, POSTs to the claim URL, and returns the Access URL", async () => {
    const claimUrl = "https://bridge.simplefin.org/simplefin/claim/demo";
    const setupToken = Buffer.from(claimUrl).toString("base64");
    const accessUrl = "https://demo:demo@bridge.simplefin.org/simplefin";

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => accessUrl,
    });

    const result = await claimSetupToken(setupToken);
    expect(result).toBe(accessUrl);
    expect(global.fetch).toHaveBeenCalledWith(
      claimUrl,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws a SimplefinHttpError with status 403 when the claim has already been used", async () => {
    const setupToken = Buffer.from("https://bridge.simplefin.org/simplefin/claim/used").toString("base64");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "",
    });

    await expect(claimSetupToken(setupToken)).rejects.toThrow(SimplefinHttpError);
    await expect(claimSetupToken(setupToken)).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a Setup Token that doesn't decode to an https:// URL", async () => {
    const setupToken = Buffer.from("not-a-url").toString("base64");
    await expect(claimSetupToken(setupToken)).rejects.toThrow("HTTPS URL");
  });

  it("refuses to claim a token whose URL resolves to a private/internal address (SSRF guard)", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]); // cloud metadata
    const setupToken = Buffer.from("https://internal.example/simplefin/claim/x").toString("base64");

    await expect(claimSetupToken(setupToken)).rejects.toMatchObject({ status: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses to claim a token whose URL resolves to a loopback address", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const setupToken = Buffer.from("https://localhost-alias.example/claim/x").toString("base64");

    await expect(claimSetupToken(setupToken)).rejects.toMatchObject({ status: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("simplefinRequest", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("GETs the path with query params and Basic Auth, returning parsed JSON", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accounts: [] }),
    });

    const result = await simplefinRequest("https://user:pass@bridge.simplefin.org/simplefin", "/accounts", {
      pending: 1,
      version: 2,
    });

    expect(result).toEqual({ accounts: [] });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://bridge.simplefin.org/simplefin/accounts?pending=1&version=2");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
    });
  });

  it("throws a SimplefinHttpError carrying the HTTP status on a non-2xx response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    await expect(
      simplefinRequest("https://user:pass@bridge.simplefin.org/simplefin", "/accounts"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses to request an Access URL that resolves to a private address (SSRF guard)", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(
      simplefinRequest("https://user:pass@internal.example/simplefin", "/accounts"),
    ).rejects.toMatchObject({ status: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
