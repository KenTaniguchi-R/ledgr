import pg from "pg";

// Runs after migrations, before the server starts (docker-entrypoint.sh).
//
// The app's runtime DB connection needs to be a non-superuser, non-BYPASSRLS
// role for RLS policies (see docs/rls-pilot.md) to have any effect at all —
// superusers, including the POSTGRES_USER role docker-compose.yml creates,
// skip RLS unconditionally. Migrations keep running as that superuser
// (DATABASE_URL) since they need full DDL privileges; this script
// provisions a separate restricted role from APP_DATABASE_URL's credentials
// and grants it exactly what the app needs on the tables migrations just
// created.
//
// Optional: if APP_DATABASE_URL isn't set, this is a no-op — the app falls
// back to DATABASE_URL (src/db/index.ts) and behaves exactly as before RLS
// existed, just without any enforcement.
//
// Idempotent and safe to run on every boot: creates the role only if
// missing, always re-applies its password (so a rotated POSTGRES_PASSWORD
// takes effect) and grants, and sets default privileges so tables added by
// *future* migrations are automatically readable by this role without
// needing this script to change.

const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

if (!APP_DATABASE_URL) {
  console.log("APP_DATABASE_URL not set — skipping restricted app role setup.");
  console.log("The app will connect via DATABASE_URL, which RLS policies do not restrict.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set — needed (as the admin/owner role) to provision the app role.");
  process.exit(1);
}

let appUser, appPassword;
try {
  const parsed = new URL(APP_DATABASE_URL);
  appUser = decodeURIComponent(parsed.username);
  appPassword = decodeURIComponent(parsed.password);
  if (!appUser || !appPassword) throw new Error("missing username or password");
} catch (err) {
  console.error(`ERROR: could not parse username/password out of APP_DATABASE_URL: ${err.message}`);
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appUser]);
    if (rows.length === 0) {
      await client.query(
        `CREATE ROLE ${client.escapeIdentifier(appUser)} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${client.escapeLiteral(appPassword)}`,
      );
      console.log(`Created restricted app role: ${appUser}`);
    } else {
      // Always re-set the password so a rotated POSTGRES_PASSWORD takes
      // effect without a manual step — this role has no other secrets.
      await client.query(
        `ALTER ROLE ${client.escapeIdentifier(appUser)} WITH PASSWORD ${client.escapeLiteral(appPassword)}`,
      );
    }

    await client.query(`GRANT USAGE ON SCHEMA public TO ${client.escapeIdentifier(appUser)}`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${client.escapeIdentifier(appUser)}`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${client.escapeIdentifier(appUser)}`);
    // Covers tables/sequences created by *future* migrations, which run as
    // whatever role owns DATABASE_URL — without this, every new migration
    // would need a matching update here.
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${client.escapeIdentifier(appUser)}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${client.escapeIdentifier(appUser)}`,
    );

    await client.query("COMMIT");
    console.log(`Restricted app role ready: ${appUser}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
} catch (err) {
  console.error(`ERROR: failed to provision app role: ${err.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
