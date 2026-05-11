import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: "ok",
      version: "0.1.0",
      db: "connected",
    });
  } catch {
    return NextResponse.json(
      { status: "error", version: "0.1.0", db: "disconnected" },
      { status: 503 }
    );
  }
}
