export class SimplefinHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SimplefinHttpError";
    this.status = status;
  }
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

  const res = await fetch(claimUrl, {
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

  const res = await fetch(`${baseUrl}${path}${query ? `?${query}` : ""}`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    throw new SimplefinHttpError(res.status, `SimpleFIN request to ${path} failed (HTTP ${res.status})`);
  }

  return res.json();
}
