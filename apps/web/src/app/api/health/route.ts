import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/** Liveness + database connectivity check for deployments. Reveals nothing else. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
