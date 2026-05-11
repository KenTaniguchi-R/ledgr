import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {
  return new McpServer({ name: "ledgr", version: "1.0.0" });
}
