import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";

let container: StartedPostgreSqlContainer;

export async function setup() {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  await buildTemplateDb(process.env.DATABASE_URL);
}

// CI フレーク対策: マイグレーション済みのテンプレート DB を実行ごとに1回だけ作る。
// 各テストファイルは CREATE DATABASE ... TEMPLATE "test_template" でクローンする
// (ファイルシステムレベルのコピーで ms オーダー) だけなので、ファイルごとの
// マイグレーションリプレイが 30s hookTimeout を吹く構造が消える。
// コンテナは実行ごとに新規起動なので、テンプレートが古くなる心配はない。
async function buildTemplateDb(connectionString: string) {
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE DATABASE "test_template"`);
  await admin.end();

  const url = new URL(connectionString);
  url.pathname = "/test_template";
  const pool = new Pool({ connectionString: url.toString() });
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
  });
  await pool.end();
}

export async function teardown() {
  await container?.stop();
}
