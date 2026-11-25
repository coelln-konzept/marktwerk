import { auditLog, type Database } from "@marktwerk/db";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Who a service change is attributed to: the signed-in user (`user.id`), or `null` for the system (a scheduled
 * job). The web `Actor` fits.
 */
export type ServiceActor = { id: string | null };

/** Writes audit entries inside the caller's transaction (CLAUDE.md: every business mutation). */
export async function audit(
  tx: Pick<Tx, "insert">,
  actorId: string | null,
  entries: { action: string; entityType: string; entityId: string | null; diff?: unknown }[],
) {
  if (entries.length === 0) return;
  await tx.insert(auditLog).values(entries.map((e) => ({ actorId, ...e, diff: e.diff ?? null })));
}
