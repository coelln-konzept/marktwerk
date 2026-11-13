import "server-only";
import {
  applyByFor,
  defaultAnchors,
  endsOnFor,
  groupConsecutiveDates,
  type PermitStatus,
  permitCovers,
  permitCoversSeveralEvents,
  resolveRelativeDue,
  seasonFor,
} from "@marktwerk/core";
import {
  checklistTemplate,
  eventPresetTemplate,
  eventSeason,
  eventType,
  permit,
  permitRequirement,
  task,
  templateItem,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { todayIn } from "@/lib/format";
import { db } from "../db";
import { EventInputError, MAX_EVENT_DAYS, presetTemplate, validateDates } from "../services/events";
import {
  desiredTasks,
  type EventContext,
  loadDueDefaults,
  loadPublishedVersions,
} from "../services/task-instantiation";

/** What one new date would bring along, worked out without writing anything. */
export type DatePreview = {
  startsOn: string;
  /** Tasks the market's template(s) create, plus the "beantragen" tasks of permits that are missing. */
  tasks: number;
  /** Of those: already due today or overdue the moment the event is created. */
  dueNow: number;
  /** Permits the event needs that an existing permit (or one made for an earlier date of this run) covers. */
  permitsCovered: number;
  /** Permits that would be created for this date. */
  permitsNew: number;
};

export type GenerationPreview = {
  dates: DatePreview[];
  /** The market has no published template: new events start without tasks. */
  noTemplate: boolean;
};

/** Same as the logbook fill: a deadline that is only a day means the end of that day. */
const DEADLINE_TIME = "23:59";

/**
 * Read-only preview of "Markt planen" step 3: how many tasks each new date gets (the same
 * `desiredTasks` calculation as the instantiation, with the anchors the new events would have), how
 * many of them are due on day one, and which permits would be covered or created (the same coverage
 * rules as the logbook fill). Nothing is written; permission is checked by the action.
 */
export async function previewGeneration(
  presetId: string,
  rawDates: string[],
  options: { merge?: boolean } = {},
): Promise<GenerationPreview> {
  const days = validateDates(rawDates);
  const template = await presetTemplate(presetId);
  // Same plan as the creation: with `merge`, one event per run of consecutive dates (keyed by its first day).
  const plan = options.merge
    ? groupConsecutiveDates(days, template.durationDays, MAX_EVENT_DAYS)
    : days.map((startsOn) => ({ startsOn, durationDays: template.durationDays }));
  const today = todayIn();

  return db.transaction(
    async (tx) => {
      const [meta] = await tx
        .select({ typeKey: eventType.key, venueKind: venue.kind })
        .from(eventType)
        .innerJoin(venue, eq(venue.id, template.venueId))
        .where(eq(eventType.id, template.eventTypeId));
      if (!meta) throw new EventInputError("preset_not_found");

      const links = await tx
        .select({ templateId: eventPresetTemplate.templateId })
        .from(eventPresetTemplate)
        .innerJoin(checklistTemplate, eq(checklistTemplate.id, eventPresetTemplate.templateId))
        .where(
          and(
            eq(eventPresetTemplate.presetId, presetId),
            eq(checklistTemplate.kind, "event"),
            isNull(checklistTemplate.archivedAt),
          ),
        )
        .orderBy(asc(eventPresetTemplate.sort), asc(checklistTemplate.name));
      const versions = await loadPublishedVersions(tx, [
        ...new Set(links.map((l) => l.templateId)),
      ]);
      const defaults = await loadDueDefaults(tx);

      const requirements = await tx
        .select()
        .from(permitRequirement)
        .where(
          and(
            eq(permitRequirement.venueId, template.venueId),
            isNull(permitRequirement.archivedAt),
            or(
              isNull(permitRequirement.eventTypeId),
              eq(permitRequirement.eventTypeId, template.eventTypeId),
            ),
          ),
        );
      const existingPermits =
        requirements.length === 0
          ? []
          : await tx
              .select()
              .from(permit)
              .where(
                and(
                  inArray(
                    permit.requirementId,
                    requirements.map((r) => r.id),
                  ),
                  isNull(permit.archivedAt),
                ),
              );
      // Saison records (Fahrplan R11/R27): the market and year of the permits that belong to one (a permit of
      // another market at the same place covers nothing here), and the market's own records with the permit
      // types their season tasks apply for (those permits get no own "beantragen" task).
      const recordIds = [
        ...new Set(existingPermits.flatMap((p) => (p.seasonId ? [p.seasonId] : []))),
      ];
      const records = new Map(
        recordIds.length === 0
          ? []
          : (
              await tx
                .select({
                  id: eventSeason.id,
                  presetId: eventSeason.presetId,
                  season: eventSeason.season,
                })
                .from(eventSeason)
                .where(inArray(eventSeason.id, recordIds))
            ).map((r) => [r.id, { presetId: r.presetId, season: r.season }]),
      );
      const ownSeasons = await tx
        .select({ id: eventSeason.id, season: eventSeason.season })
        .from(eventSeason)
        .where(eq(eventSeason.presetId, presetId));
      const seasonTaskTypes =
        ownSeasons.length === 0
          ? []
          : await tx
              .select({ seasonId: task.seasonId, permitType: templateItem.permitType })
              .from(task)
              .innerJoin(templateItem, eq(templateItem.id, task.templateItemId))
              .where(
                and(
                  inArray(
                    task.seasonId,
                    ownSeasons.map((s) => s.id),
                  ),
                  eq(task.source, "template"),
                  isNotNull(templateItem.permitType),
                  ne(task.status, "cancelled"),
                ),
              );
      // A season without a record gets one with the current versions' season items when the date is created.
      const newSeasonTypes = new Set(
        [...versions.values()].flatMap((v) =>
          v.items.flatMap((i) => (i.scope === "season" && i.permitType ? [i.permitType] : [])),
        ),
      );
      const seasonPermitTypes = (season: number): Set<string> => {
        const record = ownSeasons.find((s) => s.season === season);
        if (!record) return newSeasonTypes;
        return new Set(
          seasonTaskTypes.flatMap((t) =>
            t.seasonId === record.id && t.permitType ? [t.permitType] : [],
          ),
        );
      };

      // The permits as the fill sees them; the ones created for earlier dates of this run join the pool.
      const pool = existingPermits.map((p) => ({
        requirementId: p.requirementId,
        status: p.status as PermitStatus,
        season: p.season,
        validFrom: p.validFrom,
        validUntil: p.validUntil,
        seasonRecord: p.seasonId ? (records.get(p.seasonId) ?? null) : null,
      }));

      const dates: DatePreview[] = [];
      for (const { startsOn, durationDays } of plan) {
        const endsOn = endsOnFor(startsOn, durationDays);
        const ev: EventContext = {
          scope: "event",
          id: startsOn,
          name: template.name,
          startsOn,
          endsOn,
          presetId,
          facts: {
            eventTypeKey: meta.typeKey,
            venueId: template.venueId,
            venueKind: meta.venueKind,
          },
          anchors: new Map(Object.entries(defaultAnchors(startsOn, durationDays))),
          duties: new Map(),
        };
        let tasks = 0;
        let dueNow = 0;
        const templatePermitTypes = new Set<string>();
        const countDue = (dueAt: number | null) => {
          if (dueAt !== null && todayIn("Europe/Berlin", new Date(dueAt)) <= today) dueNow += 1;
        };
        for (const link of links) {
          const version = versions.get(link.templateId);
          if (!version) continue;
          for (const d of desiredTasks(version, ev, defaults).desired) {
            // Lists count top-level tasks; subtasks show under their parent (ADR 0021).
            if (d.parentKey) continue;
            tasks += 1;
            countDue(d.dueAt);
            if (d.permitType) templatePermitTypes.add(d.permitType);
          }
        }

        let permitsCovered = 0;
        let permitsNew = 0;
        const season = Number(startsOn.slice(0, 4));
        for (const req of requirements) {
          const covered = pool.some(
            (p) =>
              p.requirementId === req.id &&
              permitCovers(req.cadence, p, { startsOn, endsOn, season, presetId }),
          );
          if (covered) {
            permitsCovered += 1;
            continue;
          }
          permitsNew += 1;
          const seasonal = permitCoversSeveralEvents(req.cadence);
          pool.push({
            requirementId: req.id,
            status: "not_started",
            season: seasonFor(req.cadence, season),
            validFrom: null,
            validUntil: null,
            seasonRecord: seasonal ? { presetId, season } : null,
          });
          // A "beantragen" task for the permit, unless a template task (or, for a season permit, the season
          // task) already covers that permit type.
          if (
            !templatePermitTypes.has(req.permitType) &&
            !(seasonal && seasonPermitTypes(season).has(req.permitType))
          ) {
            const applyBy = applyByFor(startsOn, req.leadTimeDays, {
              startMd: req.submissionWindowStartMd,
              endMd: req.submissionWindowEndMd,
            });
            tasks += 1;
            countDue(resolveRelativeDue(applyBy, 0, DEADLINE_TIME).getTime());
          }
        }
        dates.push({ startsOn, tasks, dueNow, permitsCovered, permitsNew });
      }
      return { dates, noTemplate: versions.size === 0 };
    },
    { accessMode: "read only" },
  );
}
