/**
 * M3 seed: permit requirements per venue, the permits made from them (per season / per event / multi-year)
 * and which events they cover. Permit fees are `payable`s and are seeded in money.ts.
 */

import { permitCoversApplication } from "@marktwerk/core";
import { schema } from "@marktwerk/db";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { insertAll, type SeedContext, type Tx } from "./shared";

/** The permit that is further along wins when several of one type cover an event (as in the service). */
const STATUS_ORDER = ["granted", "applied", "preparing", "not_started", "rejected", "not_required"];

/**
 * Seed counterpart of `linkPermitTasks` (apps/web/src/server/services/permits.ts; the seed cannot import the
 * server-only services): template tasks whose item names a permit type get the event's permit of that type,
 * and open ones whose permit is applied for or granted are done. Idempotent.
 */
async function linkPermitTasks(tx: Tx) {
  const { task, templateItem, eventPermit, permit } = schema;
  const open = await tx
    .select({ id: task.id, eventId: task.eventId, permitType: templateItem.permitType })
    .from(task)
    .innerJoin(templateItem, eq(templateItem.id, task.templateItemId))
    .where(
      and(
        isNull(task.permitId),
        isNotNull(task.eventId),
        isNotNull(templateItem.permitType),
        ne(task.status, "cancelled"),
      ),
    );
  const candidates = await tx
    .select({
      eventId: eventPermit.eventId,
      permitId: permit.id,
      permitType: permit.permitType,
      status: permit.status,
      required: eventPermit.required,
    })
    .from(eventPermit)
    .innerJoin(permit, eq(permit.id, eventPermit.permitId))
    .where(and(isNull(permit.archivedAt), ne(permit.status, "superseded")));
  const byEvent = new Map<string, typeof candidates>();
  for (const c of candidates) byEvent.set(c.eventId, [...(byEvent.get(c.eventId) ?? []), c]);
  const rank = (c: (typeof candidates)[number]) =>
    (c.required && c.status !== "not_required" ? 0 : 100) + STATUS_ORDER.indexOf(c.status);

  const byPermit = new Map<string, string[]>();
  for (const t of open) {
    const best = (byEvent.get(t.eventId as string) ?? [])
      .filter((c) => c.permitType === t.permitType)
      .sort((a, b) => rank(a) - rank(b))[0];
    if (best) byPermit.set(best.permitId, [...(byPermit.get(best.permitId) ?? []), t.id]);
  }
  const statusOf = new Map(candidates.map((c) => [c.permitId, c.status]));
  let linked = 0;
  let done = 0;
  for (const [permitId, ids] of byPermit) {
    await tx.update(task).set({ permitId }).where(inArray(task.id, ids));
    linked += ids.length;
    const status = statusOf.get(permitId);
    if (!status || !permitCoversApplication(status)) continue;
    const closed = await tx
      .update(task)
      .set({ status: "done", completedAt: new Date() })
      .where(
        and(
          inArray(task.id, ids),
          inArray(task.status, ["todo", "in_progress", "waiting_external", "blocked"]),
        ),
      )
      .returning({ id: task.id });
    done += closed.length;
  }
  console.log(`✓ permit tasks linked: ${linked}, done because the permit is in: ${done}`);
}

export async function seedPermits(tx: Tx, { data }: SeedContext) {
  await insertAll(
    tx,
    schema.permitRequirement,
    data.permitRequirements.map((r) => ({
      id: r.id,
      venueId: r.venueId,
      category: r.category,
      permitType: r.permitType,
      title: r.title,
      authorityContactId: r.authorityContactId,
      cadence: r.cadence,
      leadTimeDays: r.leadTimeDays,
      submissionWindowStartMd: r.submissionWindowStartMd,
      submissionWindowEndMd: r.submissionWindowEndMd,
      expectedDecisionMd: r.expectedDecisionMd,
      typicalFeeCents: r.typicalFeeCents,
      deliverables: r.deliverables,
      notes: r.notes,
    })),
    "permit requirements",
  );

  await insertAll(
    tx,
    schema.permit,
    data.permits.map((p) => ({
      id: p.id,
      requirementId: p.requirementId,
      venueId: p.venueId,
      season: p.season,
      category: p.category,
      permitType: p.permitType,
      title: p.title,
      authorityContactId: p.authorityContactId,
      referenceNo: p.referenceNo,
      status: p.status,
      applyBy: p.applyBy,
      appliedAt: p.appliedAt,
      expectedDecisionOn: p.expectedDecisionOn,
      grantedAt: p.grantedAt,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      conditions: p.conditions,
      deliverablesReceived: p.deliverablesReceived,
      responsibleStaffMemberId: p.responsibleStaffMemberId,
      notes: p.notes,
    })),
    "permits",
  );

  await insertAll(
    tx,
    schema.eventPermit,
    data.eventPermits.map(({ eventId, permitId, required }) => ({ eventId, permitId, required })),
    "event permits",
  );

  await linkPermitTasks(tx);
}
