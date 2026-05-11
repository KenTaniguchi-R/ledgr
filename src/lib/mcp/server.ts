import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccessTokenClaims } from "./auth/token";

export function createMcpServer(): McpServer {
  return new McpServer({ name: "ledgr", version: "1.0.0" });
}

export type ToolContext = { claims: AccessTokenClaims };
