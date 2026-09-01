import { describe, it, expect } from "vitest";
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { auth } from "@/lib/auth";
import * as schema from "./index";

/**
 * Better Auth validates its models against the Drizzle schema at request time,
 * not at build time — a field the library expects but the schema lacks surfaces
 * as a runtime 500 on the first request touching that model. Issue #133 was
 * exactly that: better-auth 1.7 added `account.issuer` and every signup started
 * 500ing with `The field "issuer" does not exist in the "account" Drizzle
 * schema.`
 *
 * The drizzle adapter resolves a field as `schema[modelName][fieldName]` — the
 * JS export key on the schema object and the property key on the table, not the
 * SQL column name — so that is what this asserts. It covers the core models
 * plus every configured plugin's, and is driven by `auth.options`, so a plugin
 * added in `src/lib/auth/index.ts` is checked here without editing this file.
 */

const expectedTables = getAuthTables(auth.options);
const schemaExports = schema as Record<string, unknown>;

describe("Better Auth model shape vs. Drizzle schema", () => {
  for (const [model, definition] of Object.entries(expectedTables)) {
    const modelName = definition.modelName;

    describe(`${model} -> "${modelName}"`, () => {
      const table = schemaExports[modelName];

      it("is exported from src/db/schema", () => {
        expect(table, `no schema export named "${modelName}"`).toBeDefined();
      });

      if (!table) return;

      const columns = getTableColumns(
        table as Parameters<typeof getTableColumns>[0],
      );

      for (const [field, attr] of Object.entries(definition.fields)) {
        // `fieldName` is the property Better Auth reads off the table object;
        // it only differs from the model field when explicitly remapped.
        const property = attr.fieldName ?? field;

        it(`has field "${property}"`, () => {
          expect(
            columns[property],
            `Better Auth expects "${modelName}"."${property}"`,
          ).toBeDefined();
        });

        // A field Better Auth always writes must not be nullable — a NULL there
        // is a row its own lookups can never match. `account.issuer` is the
        // case that matters: sign-in filters on it, so a NULL issuer is an
        // account nobody can log into.
        if (attr.required && attr.defaultValue === undefined) {
          it(`has field "${property}" NOT NULL`, () => {
            expect(columns[property]?.notNull).toBe(true);
          });
        }
      }
    });
  }
});
