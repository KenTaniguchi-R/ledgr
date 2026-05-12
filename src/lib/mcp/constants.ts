export function getLedgrUrl(): string {
  return process.env.LEDGR_URL ?? "http://localhost:4200";
}

export const MCP_SCOPES = ["ledgr:read", "ledgr:write", "ledgr:sync"] as const;
export const DEFAULT_SCOPE = "ledgr:read ledgr:write ledgr:sync";

export const SCOPE_LABELS: Record<string, string> = {
  "ledgr:read": "View your accounts, transactions, budgets, and reports",
  "ledgr:write": "Update transaction categories and budget allocations",
  "ledgr:sync": "Trigger bank account syncs",
};

export const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

export const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

export const SYNC_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: false,
} as const;
