"use server";

import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  desktop: GridItem[];
  tablet: GridItem[];
  mobile: GridItem[];
}

export async function saveLayout(
  userId: string,
  layout: DashboardLayout,
  db: LedgrDb = defaultDb,
): Promise<void> {
  const layoutJson = JSON.stringify(layout);
  const existing = db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (existing) {
    db.update(userSettings)
      .set({ dashboardLayout: layoutJson })
      .where(eq(userSettings.userId, userId))
      .run();
  } else {
    db.insert(userSettings)
      .values({ id: uuid(), userId, dashboardLayout: layoutJson })
      .run();
  }
}

export async function getLayout(
  userId: string,
  db: LedgrDb = defaultDb,
): Promise<DashboardLayout | null> {
  const row = db
    .select({ dashboardLayout: userSettings.dashboardLayout })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!row?.dashboardLayout) return null;

  try {
    return JSON.parse(row.dashboardLayout) as DashboardLayout;
  } catch {
    return null;
  }
}
