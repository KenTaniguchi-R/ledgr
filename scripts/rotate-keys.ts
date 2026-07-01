/**
 * Operator entry point for encryption key rotation.
 * Usage: pnpm rotate-keys
 * Requires DATABASE_URL, ENCRYPTION_KEY, and the new ENCRYPTION_KEY_V<N> in the
 * environment (loaded from .env when present).
 */
import { rotateEncryptionKeys } from "@/lib/jobs/rotate-encryption-keys";

async function main() {
  const report = await rotateEncryptionKeys();
  console.log(
    `[rotate-keys] total=${report.total} rotated=${report.rotated} skipped=${report.skipped} failed=${report.failed}`,
  );
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
