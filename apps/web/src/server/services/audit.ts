import "server-only";
import { auditLog } from "@marktwerk/db/schema";
import type { db } from "../db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Writes audit entries inside the caller's transaction (CLAUDE.md: every business mutation). */
export async function audit(
  tx: Tx,
  actorId: string,
  entries: { action: string; entityType: string; entityId: string | null; diff?: unknown }[],
) {
  if (entries.length === 0) return;
  await tx.insert(auditLog).values(entries.map((e) => ({ actorId, ...e, diff: e.diff ?? null })));
}
