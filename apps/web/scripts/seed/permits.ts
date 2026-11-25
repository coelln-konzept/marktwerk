/**
 * M3 seed: permit requirements per venue, the permits made from them (per season / per event / multi-year)
 * and which events they cover. Permit fees are `payable`s and are seeded in money.ts.
 */

import {
  permitCoversApplication,
  permitCoversSeveralEvents,
  resolveRelativeDue,
} from "@marktwerk/core";
import { schema } from "@marktwerk/db";
import { and, asc, eq, inArray, isNotNull, isNull, ne, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { derivedId, insertAll, type SeedContext, type Tx } from "./shared";

/** The permit that is further along wins when several of one type cover an event (as in the service). */
const STATUS_ORDER = ["granted", "applied", "preparing", "not_started", "rejected", "not_required"];
const OPEN = ["todo", "in_progress", "waiting_external", "blocked"] as const;

/**
 * Seed counterpart of `linkPermitTasks` (apps/web/src/server/services/permits.ts; the seed cannot import the
 * server-only services): template tasks whose item names a permit type get the event's per-date permit of that
 * type (ADR 0024: template tasks never apply for a permit covering several dates), and open ones whose permit is
 * applied for or granted are done. One task applies for a permit: one that has a task already takes no second, and
 * of several template tasks the earliest due is linked. Idempotent.
 */
async function linkPermitTasks(tx: Tx) {
  const { task, templateItem, eventPermit, permit, permitRequirement } = schema;
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
    )
    .orderBy(asc(task.dueAt), asc(task.id));
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
    .leftJoin(permitRequirement, eq(permitRequirement.id, permit.requirementId))
    .where(
      and(
        isNull(permit.archivedAt),
        ne(permit.status, "superseded"),
        or(isNull(permit.requirementId), eq(permitRequirement.cadence, "per_event")),
      ),
    );
  const byEvent = new Map<string, typeof candidates>();
  for (const c of candidates) byEvent.set(c.eventId, [...(byEvent.get(c.eventId) ?? []), c]);
  const rank = (c: (typeof candidates)[number]) =>
    (c.required && c.status !== "not_required" ? 0 : 100) + STATUS_ORDER.indexOf(c.status);

  const taken = new Set(
    (
      await tx
        .select({ permitId: task.permitId })
        .from(task)
        .where(and(isNotNull(task.permitId), ne(task.status, "cancelled")))
    ).map((r) => r.permitId),
  );
  const byPermit = new Map<string, string[]>();
  for (const t of open) {
    const best = (byEvent.get(t.eventId as string) ?? [])
      .filter((c) => c.permitType === t.permitType)
      .sort((a, b) => rank(a) - rank(b))[0];
    if (!best || taken.has(best.permitId)) continue;
    taken.add(best.permitId);
    byPermit.set(best.permitId, [t.id]);
  }

  const statusOf = new Map(candidates.map((c) => [c.permitId, c.status] as const));
  let linked = 0;
  let done = 0;
  for (const [permitId, ids] of byPermit) {
    await tx.update(task).set({ permitId }).where(inArray(task.id, ids));
    linked += ids.length;
    const status = statusOf.get(permitId);
    if (!status || !permitCoversApplication(status)) continue;
    // A task with open subtasks stays open, as in the service (the done gate, ADR 0021).
    const sub = alias(task, "sub");
    const closed = await tx
      .update(task)
      .set({ status: "done", completedAt: new Date() })
      .where(
        and(
          inArray(task.id, ids),
          inArray(task.status, OPEN),
          notExists(
            tx
              .select({ id: sub.id })
              .from(sub)
              .where(and(eq(sub.parentTaskId, task.id), inArray(sub.status, OPEN))),
          ),
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
      eventTypeId: r.eventTypeId,
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
  await seedOwnApplyTasks(tx, data);
}

/**
 * Seed counterpart of the logbook fill's own "… beantragen" tasks (ADR 0024): a permit covering several dates gets
 * one, without an event (one per Ort and season); a per-date permit (Halteverbot) gets one on its date unless a
 * template task of that date applies for it already (GEMA anmelden, Schaustellerliste). Due at apply-by (end of day,
 * Berlin), assigned to the permit's responsible person, done once the permit is applied for or granted (at its
 * application day), as the app completes it. Ids are derived from the permit, so re-running adds nothing.
 */
async function seedOwnApplyTasks(tx: Tx, data: SeedContext["data"]) {
  const cadenceOf = new Map(data.permitRequirements.map((r) => [r.id, r.cadence]));
  const titleOf = new Map(data.permitRequirements.map((r) => [r.id, r.title]));
  const roleId = data.dutyRoles.find((r) => r.key === "permits")?.id ?? null;
  const eventOf = new Map(data.eventPermits.map((l) => [l.permitId, l.eventId]));
  const applying = new Set(
    (
      await tx
        .select({ permitId: schema.task.permitId })
        .from(schema.task)
        .where(
          and(
            isNotNull(schema.task.permitId),
            eq(schema.task.source, "template"),
            ne(schema.task.status, "cancelled"),
          ),
        )
    ).map((r) => r.permitId),
  );
  const own = data.permits.flatMap((p) => {
    if (permitCoversSeveralEvents(cadenceOf.get(p.requirementId)))
      return [{ permit: p, eventId: null }];
    if (applying.has(p.id)) return [];
    return [{ permit: p, eventId: eventOf.get(p.id) ?? null }];
  });
  await insertAll(
    tx,
    schema.task,
    own
      .filter(({ permit: p }) => p.status !== "not_required")
      .map(({ permit: p, eventId }) => {
        const filed = permitCoversApplication(p.status);
        return {
          id: derivedId("task", `permit-apply:${p.id}`),
          eventId,
          permitId: p.id,
          source: "permit" as const,
          title: `${titleOf.get(p.requirementId) ?? p.title} beantragen`,
          phase: "pre" as const,
          category: "permits" as const,
          priority: "normal" as const,
          dutyRoleId: roleId,
          assigneeId: p.responsibleStaffMemberId,
          dueAt: resolveRelativeDue(p.applyBy, 0, "23:59"),
          status: filed ? ("done" as const) : ("todo" as const),
          completedAt: filed ? resolveRelativeDue(p.appliedAt ?? p.applyBy, 0, "11:00") : null,
          completedByStaffMemberId: filed ? p.responsibleStaffMemberId : null,
        };
      }),
    "permit apply tasks",
  );
}
