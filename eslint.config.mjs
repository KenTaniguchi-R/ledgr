import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import ledgrRules from "./eslint-rules/household-scoped-query.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { ledgr: ledgrRules },
    rules: {
      "ledgr/household-scoped-query": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Stryker leaves sandbox copies of the whole tree behind. Linting those
    // repeats every finding once per sandbox and fails the run on code that
    // is not ours to fix.
    ".stryker-tmp/**",
    // Claude Code checks agent worktrees out here — full copies of the repo,
    // ignored by git via .git/info/exclude. Same problem as .stryker-tmp:
    // every finding repeats once per worktree, and the noise buries real ones.
    // CI starts from a clean checkout, so this is invisible there and constant
    // locally, which is the worst way round.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
