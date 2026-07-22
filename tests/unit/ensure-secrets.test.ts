import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const HEX_64 = /^[0-9a-f]{64}$/;
const BASE64_44 = /^[A-Za-z0-9+/=]{44}$/;

interface RunResult {
  status: number;
  encryptionKey: string;
  authSecret: string;
  stderr: string;
}

/** Sources ensure-secrets.sh the way the entrypoint does and captures the exported secrets. */
function runEnsureSecrets(env: Record<string, string | undefined>): RunResult {
  const result = spawnSync(
    "sh",
    [
      "-c",
      '. ./scripts/ensure-secrets.sh >&2 && printf "%s\\n%s" "$ENCRYPTION_KEY" "$BETTER_AUTH_SECRET"',
    ],
    {
      cwd: REPO_ROOT,
      env: { PATH: process.env.PATH, NODE_ENV: "test", ...env },
      encoding: "utf8",
    }
  );
  const [encryptionKey = "", authSecret = ""] = result.stdout.split("\n");
  return { status: result.status ?? -1, encryptionKey, authSecret, stderr: result.stderr };
}

describe("ensure-secrets.sh", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "ledgr-secrets-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("generates and persists both secrets on first boot", () => {
    const { status, encryptionKey, authSecret } = runEnsureSecrets({ LEDGR_DATA_DIR: dataDir });

    expect(status).toBe(0);
    expect(encryptionKey).toMatch(HEX_64);
    expect(authSecret).toMatch(BASE64_44);
    expect(readFileSync(join(dataDir, "encryption-key"), "utf8").trim()).toBe(encryptionKey);
    expect(readFileSync(join(dataDir, "auth-secret"), "utf8").trim()).toBe(authSecret);
  });

  it("reuses both persisted secrets on subsequent runs", () => {
    const first = runEnsureSecrets({ LEDGR_DATA_DIR: dataDir });
    const second = runEnsureSecrets({ LEDGR_DATA_DIR: dataDir });

    expect(second.status).toBe(0);
    expect(second.encryptionKey).toBe(first.encryptionKey);
    expect(second.authSecret).toBe(first.authSecret);
  });

  it("prefers env-provided secrets and writes no files", () => {
    const envKey = "a".repeat(64);
    const { status, encryptionKey, authSecret } = runEnsureSecrets({
      LEDGR_DATA_DIR: dataDir,
      ENCRYPTION_KEY: envKey,
      BETTER_AUTH_SECRET: "my-secret",
    });

    expect(status).toBe(0);
    expect(encryptionKey).toBe(envKey);
    expect(authSecret).toBe("my-secret");
    expect(existsSync(join(dataDir, "encryption-key"))).toBe(false);
    expect(existsSync(join(dataDir, "auth-secret"))).toBe(false);
  });

  it("warns when the env var differs from a previously generated key", () => {
    writeFileSync(join(dataDir, "encryption-key"), "b".repeat(64) + "\n");
    const { status, stderr } = runEnsureSecrets({
      LEDGR_DATA_DIR: dataDir,
      ENCRYPTION_KEY: "a".repeat(64),
    });

    expect(status).toBe(0);
    expect(stderr).toContain("WARNING");
  });

  it("fails without overwriting when the stored key is corrupt", () => {
    writeFileSync(join(dataDir, "encryption-key"), "not-a-valid-key\n");
    const { status } = runEnsureSecrets({ LEDGR_DATA_DIR: dataDir });

    expect(status).not.toBe(0);
    expect(readFileSync(join(dataDir, "encryption-key"), "utf8")).toBe("not-a-valid-key\n");
  });

  it("fails with guidance when no env key is set and no data dir is configured", () => {
    const { status, stderr } = runEnsureSecrets({});

    expect(status).not.toBe(0);
    expect(stderr).toContain("ENCRYPTION_KEY");
  });
});
