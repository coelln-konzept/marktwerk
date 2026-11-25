import { createHash } from "node:crypto";
import {
  berlinDay,
  dueSeasonPermits,
  expectedDecisionAfter,
  permitApplyDueAt,
  permitApplyTaskTitle,
  seasonFor,
} from "@marktwerk/core";
import {
  type Database,
  dutyRole,
  insertNotifications,
  permit,
  permitRequirement,
  task,
  venue,
} from "@marktwerk/db";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { audit } from "./audit";

export type SeasonPermitsResult = { created: number };

/**
 * Season permits created yearly from the Ort's requirements (ADR 0024, Fahrplan SAI4), nightly from 00:25 Berlin.
 * For every live requirement whose cadence covers several dates (`per_season | per_year | multi_year | standing`,
 * its Ort not archived), the core rule `dueSeasonPermits` says which season's permit is due to exist and does not
 * yet: created `SEASON_PERMIT_CREATE_DAYS` (30) days before its apply-by, which comes from the submission window,
 * else the lead time before the season start (1 March), even before any date of that season is planned. Each new
 * permit: status `not_started`, apply-by, the expected decision from the requirement, the requirement's title (as
 * the logbook fill names it), responsible = the default holder of the duty role "permits"; plus its own
 * "… beantragen" task (`source = permit`, no event, due at apply-by 23:59 Berlin, assigned to that person, as the
 * logbook fill does for a permit covering several dates). Audit `permit.create` with a system actor (null, source
 * `season_job`); one grouped "assigned" notification per run.
 *
 * Idempotent: one transaction per requirement that locks the requirement row and reads its permits again, so a
 * second run (or two at once) finds the permit and creates nothing. When dates of that season are created later,
 * the logbook fill links them to this permit (`permitCovers`) instead of making another one.
 */
export async function seasonPermits(
  db: Database,
  now: Date = new Date(),
): Promise<SeasonPermitsResult> {
  const today = berlinDay(now);
  const requirements = await db
    .select({ id: permitRequirement.id })
    .from(permitRequirement)
    .innerJoin(venue, eq(venue.id, permitRequirement.venueId))
    .where(
      and(
        isNull(permitRequirement.archivedAt),
        isNull(venue.archivedAt),
        ne(permitRequirement.cadence, "per_event"),
      ),
    )
    .orderBy(asc(permitRequirement.id));
  if (requirements.length === 0) return { created: 0 };
  const [role] = await db
    .select({ id: dutyRole.id, defaultStaffMemberId: dutyRole.defaultStaffMemberId })
    .from(dutyRole)
    .where(eq(dutyRole.key, "permits"));
  const responsible = role?.defaultStaffMemberId ?? null;

  const createdIds: string[] = [];
  for (const { id } of requirements) {
    const ids = await db.transaction(async (tx) => {
      const [req] = await tx
        .select()
        .from(permitRequirement)
        .where(and(eq(permitRequirement.id, id), isNull(permitRequirement.archivedAt)))
        .for("update");
      if (!req) return [];
      const existing = await tx
        .select({ status: permit.status, season: permit.season, validUntil: permit.validUntil })
        .from(permit)
        .where(and(eq(permit.requirementId, req.id), isNull(permit.archivedAt)));
      const made: string[] = [];
      for (const due of dueSeasonPermits(req, existing, today)) {
        const [row] = await tx
          .insert(permit)
          .values({
            requirementId: req.id,
            venueId: req.venueId,
            season: seasonFor(req.cadence, due.season),
            category: req.category,
            permitType: req.permitType,
            title: req.title,
            authorityContactId: req.authorityContactId,
            status: "not_started",
            applyBy: due.applyBy,
            expectedDecisionOn: expectedDecisionAfter(due.applyBy, req.expectedDecisionMd),
            responsibleStaffMemberId: responsible,
          })
          .returning({ id: permit.id });
        if (!row) throw new Error("insert failed");
        const [own] = await tx
          .insert(task)
          .values({
            permitId: row.id,
            eventId: null,
            source: "permit",
            title: permitApplyTaskTitle(req.title),
            phase: "pre",
            category: "permits",
            priority: "normal",
            dutyRoleId: role?.id ?? null,
            assigneeId: responsible,
            dueAt: permitApplyDueAt(due.applyBy),
          })
          .returning({ id: task.id });
        await audit(tx, null, [
          {
            action: "permit.create",
            entityType: "permit",
            entityId: row.id,
            diff: {
              source: "season_job",
              requirementId: req.id,
              season: due.season,
              applyBy: due.applyBy,
              taskId: own?.id ?? null,
            },
          },
        ]);
        made.push(row.id);
      }
      return made;
    });
    createdIds.push(...ids);
  }

  if (responsible && createdIds.length > 0) {
    const key = createHash("sha1")
      .update([...createdIds].sort().join(","))
      .digest("hex");
    await insertNotifications(db, [
      {
        recipientStaffMemberId: responsible,
        reason: "assigned",
        subjectType: "permit",
        subjectId: createdIds[0],
        title:
          createdIds.length === 1
            ? "Neue Aufgabe: Genehmigung beantragen"
            : `${createdIds.length} neue Aufgaben: Genehmigungen beantragen`,
        link: "/genehmigungen?fokus=fehlt",
        dedupeKey: `assigned:season-permits:${key.slice(0, 16)}`,
      },
    ]);
  }
  return { created: createdIds.length };
}
