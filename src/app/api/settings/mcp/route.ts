import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nowISO } from "@/lib/date-utils";
import { v4 as uuid } from "uuid";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await request.json();
  const mcpEnabled = body.mcpEnabled === true ? 1 : 0;

  const existing = db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (existing) {
    db.update(userSettings)
      .set({ mcpEnabled, updatedAt: nowISO() })
      .where(eq(userSettings.id, existing.id))
      .run();
  } else {
    db.insert(userSettings)
      .values({
        id: uuid(),
        userId,
        mcpEnabled,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      })
      .run();
  }

  return NextResponse.json({ mcpEnabled: mcpEnabled === 1 });
}
