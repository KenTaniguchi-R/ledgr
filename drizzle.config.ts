import { defineConfig } from "drizzle-kit";
import path from "node:path";

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema/index.ts",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env.DATABASE_PATH ||
      path.join(process.cwd(), "data", "ledgr.db"),
  },
});
