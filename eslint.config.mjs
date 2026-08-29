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
  ]),
]);

export default eslintConfig;
