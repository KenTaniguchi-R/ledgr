import { SimplefinHttpError } from "./client";
import type { ConnectionStatus } from "@/db/schema";

/**
 * SimpleFIN has no webhooks — item-health signals (revoked/expired access)
 * must be inferred from HTTP response codes during a poll, per the protocol's
 * required checklist: "Handles a 403 response from /accounts."
 */
export function classifyPollError(err: unknown): {
  status: Extract<ConnectionStatus, "revoked" | "error">;
  errorCode: string;
  message: string;
} {
  if (err instanceof SimplefinHttpError && err.status === 403) {
    return { status: "revoked", errorCode: "ACCESS_REVOKED", message: err.message };
  }
  const message = err instanceof Error ? err.message : "Unknown SimpleFIN sync error";
  const errorCode = err instanceof SimplefinHttpError ? `HTTP_${err.status}` : "UNKNOWN";
  return { status: "error", errorCode, message };
}
