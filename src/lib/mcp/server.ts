import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { AccessTokenClaims } from "./auth/token";
import { registerAllTools } from "./tools";

export function createMcpServer(): McpServer {
  return new McpServer({ name: "ledgr", version: "1.0.0" });
}

export const mcpHandler = createMcpHandler(({ authInfo }) => {
  const claims = authInfo?.extra?.claims as AccessTokenClaims | undefined;
  if (!claims) {
    throw new Error("Authenticated MCP claims are required");
  }

  const server = createMcpServer();
  registerAllTools(server, claims);
  return server;
});
