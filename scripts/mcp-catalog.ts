// Serves Ledgr's MCP tool definitions over stdio with no database or OAuth,
// so directories like Glama can start it and call tools/list. Tool calls
// return an error pointing at a real instance. See src/lib/mcp/catalog.ts.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createCatalogServer } from "@/lib/mcp/catalog";

createCatalogServer()
  .connect(new StdioServerTransport())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
