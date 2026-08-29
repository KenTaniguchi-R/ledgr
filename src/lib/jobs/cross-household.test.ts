import { describe, it, expect, vi } from "vitest";
import { assertCanEnumerateHouseholds } from "./cross-household";
import type { LedgrDb } from "@/db";

function dbReturning(rows: unknown[]): LedgrDb {
  return { execute: vi.fn().mockResolvedValue({ rows }) } as unknown as LedgrDb;
}

describe("assertCanEnumerateHouseholds", () => {
  it("allows the job when RLS is not enabled on households", async () => {
    const db = dbReturning([{ rls_enabled: false, bypasses_rls: false }]);
    await expect(assertCanEnumerateHouseholds(db)).resolves.toBeUndefined();
  });

  it("allows the job when RLS is enabled but the role bypasses it", async () => {
    const db = dbReturning([{ rls_enabled: true, bypasses_rls: true }]);
    await expect(assertCanEnumerateHouseholds(db)).resolves.toBeUndefined();
  });

  it("refuses rather than silently processing zero households", async () => {
    const db = dbReturning([{ rls_enabled: true, bypasses_rls: false }]);
    await expect(assertCanEnumerateHouseholds(db)).rejects.toThrow(
      /Cannot enumerate households/,
    );
  });

  it("stays out of the way when the table cannot be resolved", async () => {
    const db = dbReturning([]);
    await expect(assertCanEnumerateHouseholds(db)).resolves.toBeUndefined();
  });
});
