import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import type { DashboardLayout } from "@/components/organisms/widgets/registry";

export async function getLayoutForUser(
  userId: string,
  db: LedgrDb = defaultDb,
): Promise<DashboardLayout | null> {
  const [row] = await db
    .select({ dashboardLayout: userSettings.dashboardLayout })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row?.dashboardLayout) return null;

  try {
    return JSON.parse(row.dashboardLayout) as DashboardLayout;
  } catch {
    return null;
  }
}
