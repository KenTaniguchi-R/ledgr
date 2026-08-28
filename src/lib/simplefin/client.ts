import { lookup } from "node:dns/promises";

export class SimplefinHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SimplefinHttpError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------
//
// Both the claim URL (decoded from a user-pasted Setup Token) and the Access
// URL (returned by whatever server that claim URL points to) are fully
// attacker-controlled strings that this server then fetches. SimpleFIN
// Servers/Bridges are self-hostable at arbitrary domains, so we can't use a
// fixed allowlist — instead every request:
//
//  1. Resolves the hostname and rejects private/loopback/link-local/reserved
//     address space (incl. cloud metadata endpoints) before fetching.
//     NOTE: this is a resolve-then-connect check, not a pinned connection —
//     it closes the realistic case (a URL pointing at a static private
//     address) but doesn't fully eliminate a same-request DNS-rebinding
//     attack, since `fetch()` re-resolves DNS independently when it
//     connects. Fully closing that would need a custom low-level HTTP
//     client with a pinned `connect` hook (e.g. via the `undici` package's
//     `Agent`), which isn't available here without adding a new dependency
//     — flagged for the maintainer rather than added unilaterally.
//  2. Never follows redirects (`redirect: "manual"`) — a 3xx response is
//     rejected outright rather than transparently re-requested, since a
//     redirect target is never validated against this guard.

function isBlockedIPv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o))) return true;
  const [a, b] = octets;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    a === 192 && b === 168 || // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
    a >= 224 // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast
  );
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10 link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4 address too.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

async function assertPublicHost(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SimplefinHttpError(400, "Malformed URL");
  }
  if (url.protocol !== "https:") {
    throw new SimplefinHttpError(400, "URL must use https://");
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new SimplefinHttpError(400, `Could not resolve host "${url.hostname}"`);
  }

  for (const { address, family } of addresses) {
    const blocked = family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
    if (blocked) {
      throw new SimplefinHttpError(400, `Refusing to connect to a private or reserved address ("${url.hostname}")`);
    }
  }
}

/** fetch() with SSRF validation and no redirect-following. */
async function guardedFetch(url: string, init: RequestInit): Promise<Response> {
  await assertPublicHost(url);
  const res = await fetch(url, { ...init, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new SimplefinHttpError(502, "Redirects are not allowed");
  }
  // Node's fetch reports a disallowed manual redirect as an opaqueredirect
  // response (status 0, type "opaqueredirect") rather than exposing the 3xx.
  if (res.type === "opaqueredirect") {
    throw new SimplefinHttpError(502, "Redirects are not allowed");
  }
  return res;
}

/**
 * Exchanges a one-time base64-encoded SimpleFIN Setup Token for a long-lived
 * Access URL (HTTP Basic Auth credentials baked into the URL). Per the
 * protocol, this claim can only succeed once — the caller must persist the
 * returned Access URL immediately.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken, "base64").toString("utf8");
  } catch {
    throw new SimplefinHttpError(400, "Setup Token is not valid base64");
  }

  if (!claimUrl.startsWith("https://")) {
    throw new SimplefinHttpError(400, "Setup Token must decode to an HTTPS URL");
  }

  const res = await guardedFetch(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
  });

  if (!res.ok) {
    throw new SimplefinHttpError(
      res.status,
      res.status === 403
        ? "Setup Token has already been claimed or does not exist"
        : `Failed to claim SimpleFIN Access URL (HTTP ${res.status})`,
    );
  }

  const accessUrl = (await res.text()).trim();
  if (!accessUrl.startsWith("https://")) {
    throw new SimplefinHttpError(502, "SimpleFIN server returned an invalid Access URL");
  }
  await assertPublicHost(accessUrl);
  return accessUrl;
}

interface ParsedAccessUrl {
  /** Access URL with Basic Auth credentials stripped, ready to append a path to. */
  baseUrl: string;
  authHeader: string;
}

/** Splits an Access URL's embedded `user:pass@` credentials into a request-ready base URL + Basic Auth header. */
export function parseAccessUrl(accessUrl: string): ParsedAccessUrl {
  const url = new URL(accessUrl);
  const authHeader = `Basic ${Buffer.from(`${url.username}:${url.password}`).toString("base64")}`;
  url.username = "";
  url.password = "";
  return { baseUrl: url.toString().replace(/\/$/, ""), authHeader };
}

/** GETs a SimpleFIN Server resource (e.g. `/accounts`) using the given Access URL. */
export async function simplefinRequest(
  accessUrl: string,
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<unknown> {
  const { baseUrl, authHeader } = parseAccessUrl(accessUrl);

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();

  const res = await guardedFetch(`${baseUrl}${path}${query ? `?${query}` : ""}`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    throw new SimplefinHttpError(res.status, `SimpleFIN request to ${path} failed (HTTP ${res.status})`);
  }

  return res.json();
}
