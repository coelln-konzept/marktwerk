import "server-only";
import {
  applyByFor,
  defaultAnchors,
  endsOnFor,
  type PermitStatus,
  permitCovers,
  resolveRelativeDue,
  seasonFor,
} from "@marktwerk/core";
import {
  checklistTemplate,
  eventPresetTemplate,
  eventType,
  permit,
  permitRequirement,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { todayIn } from "@/lib/format";
import { db } from "../db";
import { EventInputError, presetTemplate, validateDates } from "../services/events";
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
): Promise<GenerationPreview> {
  const days = validateDates(rawDates);
  const template = await presetTemplate(presetId);
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
      // The permits as the fill sees them; the ones created for earlier dates of this run join the pool.
      const pool = existingPermits.map((p) => ({
        requirementId: p.requirementId,
        status: p.status as PermitStatus,
        season: p.season,
        validFrom: p.validFrom,
        validUntil: p.validUntil,
      }));

      const dates: DatePreview[] = [];
      for (const startsOn of days) {
        const endsOn = endsOnFor(startsOn, template.durationDays);
        const ev: EventContext = {
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
          anchors: new Map(Object.entries(defaultAnchors(startsOn, template.durationDays))),
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
              permitCovers(req.cadence, p, { startsOn, endsOn, season }),
          );
          if (covered) {
            permitsCovered += 1;
            continue;
          }
          permitsNew += 1;
          pool.push({
            requirementId: req.id,
            status: "not_started",
            season: seasonFor(req.cadence, season),
            validFrom: null,
            validUntil: null,
          });
          // A "beantragen" task for the permit, unless a template task already covers that permit type.
          if (!templatePermitTypes.has(req.permitType)) {
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
