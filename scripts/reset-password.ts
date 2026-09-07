/**
 * Operator entry point for checking or resetting a local email/password
 * credential, for instances with no outbound mail to drive the reset flow.
 * Usage: pnpm reset-password --check <email>
 *        pnpm reset-password --set <email>
 * The password is read from a hidden prompt, never from argv, so it stays out
 * of shell history. Requires DATABASE_URL (loaded from .env when present).
 */
import { createInterface } from "node:readline";
import { auth } from "@/lib/auth";

/** Reads a line from stdin without echoing it back to the terminal. */
function promptHidden(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // `_writeToOutput` is readline's echo hook; muting it hides the typed password.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
    s,
  ) => {
    if (s.includes(label)) process.stdout.write(label);
  };
  return new Promise((resolve) =>
    rl.question(label, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

async function main() {
  const [mode, email] = process.argv.slice(2);
  if ((mode !== "--check" && mode !== "--set") || !email) {
    console.error("Usage: pnpm reset-password --check|--set <email>");
    process.exit(1);
  }

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.findUserByEmail(email);
  if (!user) {
    console.error(`[reset-password] no user with email ${email}`);
    process.exit(1);
  }

  const account = await ctx.internalAdapter.findCredentialAccount(user.user.id);
  if (!account?.password) {
    console.error(`[reset-password] ${email} has no password credential`);
    process.exit(1);
  }

  if (mode === "--check") {
    const password = await promptHidden("Password to check: ");
    const ok = await ctx.password.verify({ hash: account.password, password });
    console.log(`[reset-password] ${ok ? "MATCH" : "NO MATCH"} for ${email}`);
    process.exit(ok ? 0 : 1);
  }

  const password = await promptHidden("New password: ");
  const confirm = await promptHidden("Confirm new password: ");
  if (password !== confirm) {
    console.error("[reset-password] passwords do not match");
    process.exit(1);
  }
  const minLength = auth.options.emailAndPassword?.minPasswordLength ?? 8;
  if (password.length < minLength) {
    console.error(`[reset-password] password must be >= ${minLength} chars`);
    process.exit(1);
  }

  await ctx.internalAdapter.updatePassword(
    user.user.id,
    await ctx.password.hash(password),
  );
  console.log(`[reset-password] password updated for ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
