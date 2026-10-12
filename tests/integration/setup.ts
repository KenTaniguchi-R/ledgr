import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import * as schema from "../../src/db/schema";
import path from "node:path";

export async function createTestDb() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://ledgr:ledgr@localhost:5432/ledgr_test";

  const dbName = `test_${randomUUID().replace(/-/g, "")}`;

  // Isolate each test file in its own *database* (not a schema). Migrations
  // reference tables as `"public"."<table>"`, which only resolves when the
  // objects live in the public schema — a per-schema/search_path approach breaks
  // on those qualified references. A throwaway database per file gives every test
  // its own public schema, keeps the concurrent suite isolated, and is robust to
  // future migrations regardless of how they qualify identifiers.
  //
  // CI フレーク対策: DB 作成はマイグレーション済みテンプレートのクローン
  // (CREATE DATABASE ... TEMPLATE "test_template") で行う。
  // テンプレートは tests/global-setup.ts で実行ごとに1回だけ作成され、
  // クローンはファイルシステムレベルのコピーなので ms オーダー。
  // テンプレートへの接続が残っているとクローンできないため、globalSetup 側の
  // pool は必ず閉じておくこと。
  const admin = new Pool({ connectionString });
  try {
    await admin.query(`CREATE DATABASE "${dbName}" TEMPLATE "test_template"`);
  } catch {
    // テンプレートが無い場合 (globalSetup を経由しない単体実行など) は
    // 従来通り CREATE + マイグレーションリプレイにフォールバック。
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const fallbackUrl = new URL(connectionString);
    fallbackUrl.pathname = `/${dbName}`;
    const fallbackPool = new Pool({ connectionString: fallbackUrl.toString() });
    await migrate(drizzle({ client: fallbackPool, schema }), {
      migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
    });
    await fallbackPool.end();
  }
  await admin.end();

  const url = new URL(connectionString);
  url.pathname = `/${dbName}`;

  const pool = new Pool({ connectionString: url.toString() });
  const db = drizzle({ client: pool, schema });

  return {
    db,
    async close() {
      await pool.end();
      // DROP DATABASE cannot run while connections are open; FORCE terminates any
      // stragglers (Postgres 13+).
      const admin2 = new Pool({ connectionString });
      await admin2.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin2.end();
    },
  };
}
