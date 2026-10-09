import type { McpServer } from "@modelcontextprotocol/server";
import type { AccessTokenClaims } from "./auth/token";
import { createMcpServer } from "./server";
import { registerAllTools } from "./tools";

// Every scope, so the catalog lists every tool a fully authorized client sees.
const CATALOG_CLAIMS: AccessTokenClaims = {
  sub: "catalog",
  household_id: "catalog",
  scope: "ledgr:read ledgr:write ledgr:sync",
};

export const CATALOG_ONLY_MESSAGE =
  "This is Ledgr's tool catalog, which lists the tools but has no data behind it. " +
  "Run Ledgr (https://github.com/KenTaniguchi-R/ledgr), set MCP_ENABLED=true, " +
  "and connect your MCP client to <your-ledgr-url>/api/mcp to use them.";

/**
 * An MCP server with the same tool definitions as /api/mcp but no data access,
 * for directories (Glama) that need to start a server and call tools/list
 * without a database or an OAuth token. Every tool handler is replaced before
 * registration, so none of them can reach @/queries.
 */
export function createCatalogServer(): McpServer {
  const server = createMcpServer();
  const registerTool = server.registerTool.bind(server);

  server.registerTool = ((name: string, config: Parameters<McpServer["registerTool"]>[1]) =>
    registerTool(name, config, async () => ({
      content: [{ type: "text" as const, text: CATALOG_ONLY_MESSAGE }],
      isError: true,
    }))) as McpServer["registerTool"];

  registerAllTools(server, CATALOG_CLAIMS);
  return server;
}
