/**
 * Turns a Better Auth client error into something a self-hoster can act on.
 *
 * Both auth forms used to collapse every failure into "Something went wrong.
 * Please try again." — which is actively misleading for a 500, where retrying
 * can never work. Issue #133 sat unnoticed behind that message: the server was
 * logging a precise schema error while the only person who could fix it was
 * told to try again.
 */

/** The shape Better Auth's client returns in `{ error }`. */
export interface AuthClientError {
  code?: string;
  message?: string;
  status?: number;
  statusText?: string;
}

export const GENERIC_ERROR = "Something went wrong. Please try again.";

export const SERVER_ERROR =
  "The server couldn't complete that request. This is a problem with the Ledgr server, not your details — check the server logs for the cause.";

/**
 * @param error   the `error` from a Better Auth client call
 * @param known   context-specific copy for error codes this form expects
 */
export function authErrorMessage(
  error: AuthClientError | null | undefined,
  known: Record<string, string> = {},
): string {
  if (!error) return GENERIC_ERROR;

  // A code we have written copy for always wins — it is the most specific.
  const mapped = known[error.code ?? ""];
  if (mapped) return mapped;

  // 5xx is never the user's fault and never fixed by retrying. Deliberately
  // does not echo the server's message: point at the logs, which hold the
  // detail, rather than leaking internals into the browser.
  if (error.status !== undefined && error.status >= 500) return SERVER_ERROR;

  // 4xx messages from Better Auth are written for end users ("Password is too
  // short"), so they beat the generic fallback.
  const message = error.message?.trim();
  if (message) return message;

  return GENERIC_ERROR;
}
