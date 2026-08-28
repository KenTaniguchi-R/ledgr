// Tables carrying a `householdId` column (src/db/schema/*.ts). Isolation for
// these tables is enforced by convention (manual filtering), not Postgres
// RLS, so a developer can forget the filter entirely and nothing stops them.
//
// This rule deliberately checks only the two patterns that have *no*
// legitimate exception in this codebase:
//   1. .update(table)/.delete(table) with no .where(...) anywhere in the
//      chain — an unconditional mutation of every row in the table.
//   2. .insert(table).values(...) whose values don't set householdId.
//
// It does NOT try to verify that reads (.from(table)) or by-id
// .where(eq(table.id, ...)) updates are correctly household-scoped, because
// this codebase has several legitimate patterns that a lexical check can't
// tell apart from a real bug: looking up a row by a unique external token
// before household context exists (OAuth codes, Plaid webhook item ids), and
// re-using a row id that came from an earlier household-scoped SELECT in the
// same function. Flagging those would just train everyone to ignore the rule.
const SCOPED_TABLES = new Set([
  "bankConnections",
  "oauthCodes",
  "oauthRefreshTokens",
  "merchants",
  "budgets",
  "savedReports",
  "householdMembers",
  "categoryGroups",
  "categories",
  "categoryRules",
  "transactions",
  "accounts",
  "recurringTransactions",
]);

function getOuterChain(node) {
  let outer = node;
  while (
    outer.parent &&
    (outer.parent.type === "MemberExpression" || outer.parent.type === "CallExpression")
  ) {
    outer = outer.parent;
  }
  return outer;
}

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

// Batch inserts commonly build the row array earlier in the function
// (`rows.push({ ..., householdId, ... })`) and pass just the variable to
// .values(...) later, so the householdId literal isn't in the insert
// statement itself. Search the whole enclosing function instead of just the
// statement to accommodate that — narrower than "whole file", still catches
// an insert with no householdId set anywhere nearby.
function getEnclosingFunction(node) {
  let cur = node.parent;
  while (cur && !FUNCTION_TYPES.has(cur.type)) cur = cur.parent;
  return cur;
}

const plugin = {
  rules: {
    "household-scoped-query": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Flag unconditional update/delete and householdId-less insert against household-scoped tables",
        },
        schema: [],
        messages: {
          unconditionalMutation:
            "{{method}}({{table}}) has no .where(...) anywhere in the chain — this mutates every row in '{{table}}' across every household. This table has no Postgres RLS backstop, so a missing filter here is a real cross-tenant bug, not just a lint nit.",
          missingHouseholdIdOnInsert:
            "insert({{table}}).values(...) doesn't set householdId. Rows in this table are isolated by householdId with no Postgres RLS backstop — an insert missing it either errors on a NOT NULL constraint or, worse, silently orphans the row.",
        },
      },
      create(context) {
        const filename = (context.filename ?? context.getFilename()).replaceAll("\\", "/");
        if (filename.endsWith("src/lib/scoped-query.ts")) return {};
        // Test files run against a schema-per-file isolated Postgres DB
        // (tests/integration/setup.ts) and routinely do unconditional
        // `db.delete(table)` cleanup in beforeEach/afterEach — that's not a
        // cross-tenant bug, it's the isolation mechanism working as intended.
        const isTestFile = /\.(test|spec)\.tsx?$/.test(filename);

        const sourceCode = context.sourceCode ?? context.getSourceCode();

        return {
          CallExpression(node) {
            const callee = node.callee;
            if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") {
              return;
            }
            const method = callee.property.name;
            if (method !== "update" && method !== "delete" && method !== "insert") return;

            const arg = node.arguments[0];
            if (!arg || arg.type !== "Identifier" || !SCOPED_TABLES.has(arg.name)) return;

            const outer = getOuterChain(node);

            if (method === "insert") {
              const scope = getEnclosingFunction(node) ?? outer;
              const text = sourceCode.getText(scope);
              if (!text.includes("householdId")) {
                context.report({
                  node,
                  messageId: "missingHouseholdIdOnInsert",
                  data: { table: arg.name },
                });
              }
              return;
            }

            if (isTestFile) return;

            // update / delete: only flag when .where( is entirely absent
            // from the chain — see file header for why we don't try to
            // verify *which* condition it filters on.
            const text = sourceCode.getText(outer);
            if (!text.includes(".where(")) {
              context.report({
                node,
                messageId: "unconditionalMutation",
                data: { method, table: arg.name },
              });
            }
          },
        };
      },
    },
  },
};

export default plugin;
