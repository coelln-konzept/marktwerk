/*
 * Saison records (research 13 §6): one per market (preset) and calendar year, with its own anchors and checklist.
 * `ensureEventSeasonTx` is THE one path that creates them (nightly job, "Markt planen", moving an event into a new
 * year); the web wrapper `ensureEventSeason` adds the permission check and the transaction.
 */
import {
  berlinDay,
  expectedStartFromLastSeason,
  initialSeasonStatus,
  type SeasonAnchorKey,
  type SeasonEventDates,
  type SeasonStatus,
  seasonAnchors,
  seasonsToKeep,
} from "@marktwerk/core";
import { type Database, event, eventPreset, eventSeason, eventSeasonAnchor } from "@marktwerk/db";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { audit, type ServiceActor, type Tx } from "./audit";
import { instantiateTemplatesForSeasons, loadDueDefaults } from "./task-instantiation";

/** Why a season record was made (written to the audit entry). */
export type SeasonSource =
  | "job"
  | "markt_planen"
  | "agreement"
  | "event_move"
  | "manual"
  /** The logbook fill made a season permit for a market whose record was missing (Fahrplan R11). */
  | "logbook_fill";

/** The season's events as the rules see them: not archived (cancelled ones are dropped by the rules). */
export async function seasonEventDates(
  tx: Pick<Database, "select">,
  presetId: string,
  season: number,
): Promise<SeasonEventDates[]> {
  return tx
    .select({ startsOn: event.startsOn, endsOn: event.endsOn, status: event.status })
    .from(event)
    .where(and(eq(event.presetId, presetId), eq(event.season, season), isNull(event.archivedAt)));
}

/** First day of the market's earliest non-cancelled, not archived event in `season`; null without one. */
async function firstDateOf(
  tx: Pick<Database, "select">,
  presetId: string,
  season: number,
): Promise<string | null> {
  const [row] = await tx
    .select({ startsOn: event.startsOn })
    .from(event)
    .where(
      and(
        eq(event.presetId, presetId),
        eq(event.season, season),
        isNull(event.archivedAt),
        ne(event.status, "cancelled"),
      ),
    )
    .orderBy(asc(event.startsOn))
    .limit(1);
  return row?.startsOn ?? null;
}

export type SeasonAnchorDiff = Partial<
  Record<SeasonAnchorKey, { from: string | null; to: string | null }>
>;

/**
 * Writes the season anchors (`season_start`, `season_end`; a null date removes the row). Returns what changed,
 * empty when nothing did.
 */
export async function writeSeasonAnchors(
  tx: Tx,
  seasonId: string,
  next: Record<SeasonAnchorKey, string | null>,
): Promise<SeasonAnchorDiff> {
  const rows = await tx
    .select({ key: eventSeasonAnchor.key, date: eventSeasonAnchor.date })
    .from(eventSeasonAnchor)
    .where(eq(eventSeasonAnchor.seasonId, seasonId));
  const old = new Map(rows.map((r) => [r.key, r.date]));
  const diff: SeasonAnchorDiff = {};
  for (const key of Object.keys(next) as SeasonAnchorKey[]) {
    const from = old.get(key) ?? null;
    const to = next[key];
    if (from === to) continue;
    diff[key] = { from, to };
    if (to === null) {
      await tx
        .delete(eventSeasonAnchor)
        .where(and(eq(eventSeasonAnchor.seasonId, seasonId), eq(eventSeasonAnchor.key, key)));
    } else {
      await tx
        .insert(eventSeasonAnchor)
        .values({ seasonId, key, date: to })
        .onConflictDoUpdate({
          target: [eventSeasonAnchor.seasonId, eventSeasonAnchor.key],
          set: { date: to },
        });
    }
  }
  return diff;
}

export type EnsuredSeason = {
  id: string;
  created: boolean;
  status: SeasonStatus;
  /** Season tasks created (0 for an existing record). */
  tasks: number;
};

/**
 * THE one path that creates a Saison record (research 13 §6.2), inside the caller's transaction; idempotent: an
 * existing record (archived ones included) is returned as it is. A new record gets
 * - `expected_start` = last season's first date moved to the same weekday and ISO week, or 1 January;
 * - the anchors `season_start` / `season_end` from the season's events (`seasonAnchors`);
 * - the status from its dates (`initialSeasonStatus`: planning, dates_set, or closed when already over);
 * - its season items, instantiated through the event path with a season context, unless it is created closed
 *   (a season that is over has nothing left to prepare, and its overdue tasks would only be noise);
 * - an audit entry `season.create` (actor = the user, or null for the job).
 * Existing records are not re-instantiated: template changes never reach them automatically (propagation, R14).
 */
export async function ensureEventSeasonTx(
  tx: Tx,
  actor: ServiceActor,
  presetId: string,
  season: number,
  options: { today: string; source: SeasonSource },
): Promise<EnsuredSeason> {
  const find = async () => {
    const [row] = await tx
      .select({ id: eventSeason.id, status: eventSeason.status })
      .from(eventSeason)
      .where(and(eq(eventSeason.presetId, presetId), eq(eventSeason.season, season)));
    return row;
  };
  const existing = await find();
  if (existing) return { id: existing.id, created: false, status: existing.status, tasks: 0 };

  const expectedStart = expectedStartFromLastSeason(
    await firstDateOf(tx, presetId, season - 1),
    season,
  );
  const events = await seasonEventDates(tx, presetId, season);
  const status = initialSeasonStatus(events, options.today);
  const [row] = await tx
    .insert(eventSeason)
    .values({ presetId, season, expectedStart, status })
    .onConflictDoNothing({ target: [eventSeason.presetId, eventSeason.season] })
    .returning({ id: eventSeason.id });
  if (!row) {
    // Created concurrently (job and "Markt planen" at the same moment): use that one.
    const other = await find();
    if (!other) throw new Error("event_season insert failed");
    return { id: other.id, created: false, status: other.status, tasks: 0 };
  }
  const anchors = seasonAnchors(events, expectedStart);
  await writeSeasonAnchors(tx, row.id, anchors);
  const instantiated =
    status === "closed"
      ? { checklists: 0, tasks: 0 }
      : await instantiateTemplatesForSeasons(tx, actor, [row.id]);
  await audit(tx, actor.id, [
    {
      action: "season.create",
      entityType: "event_season",
      entityId: row.id,
      diff: {
        presetId,
        season,
        expectedStart,
        status,
        anchors,
        source: options.source,
        tasks: instantiated.tasks,
      },
    },
  ]);
  return { id: row.id, created: true, status, tasks: instantiated.tasks };
}

/**
 * Nightly job `event-seasons` (research 13 §6.4): every active, not archived market has a Saison record for the
 * current and the next year (Berlin), each new one with its season items. Idempotent (existing records are left
 * alone), so it can run as often as the scheduler likes. One transaction per market, so one broken market does
 * not hold back the others' records… but it still fails the run, to be seen in the log.
 */
export async function eventSeasons(
  db: Database,
  now: Date = new Date(),
): Promise<{ markets: number; created: number; tasks: number }> {
  const { timeZone } = await loadDueDefaults(db);
  const today = berlinDay(now, timeZone);
  const seasons = seasonsToKeep(now, timeZone);
  const markets = await db
    .select({ id: eventPreset.id })
    .from(eventPreset)
    .where(and(eq(eventPreset.active, true), isNull(eventPreset.archivedAt)))
    .orderBy(asc(eventPreset.name), asc(eventPreset.id));
  let created = 0;
  let tasks = 0;
  const failures: unknown[] = [];
  for (const market of markets) {
    try {
      await db.transaction(async (tx) => {
        for (const season of seasons) {
          const result = await ensureEventSeasonTx(tx, { id: null }, market.id, season, {
            today,
            source: "job",
          });
          if (result.created) created += 1;
          tasks += result.tasks;
        }
      });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0)
    throw new Error(`event-seasons: ${failures.length} of ${markets.length} markets failed`, {
      cause: failures[0],
    });
  return { markets: markets.length, created, tasks };
}

/** Seasons (preset, year) touched by these events; events without a market have none. */
export async function seasonKeysOfEvents(
  tx: Pick<Database, "select">,
  eventIds: readonly string[],
): Promise<{ presetId: string; season: number }[]> {
  if (eventIds.length === 0) return [];
  const rows = await tx
    .select({ presetId: event.presetId, season: event.season })
    .from(event)
    .where(inArray(event.id, [...new Set(eventIds)]));
  return uniqueSeasonKeys(rows);
}

/** Distinct (preset, season) pairs, without the ones lacking a preset; in a stable order. */
export function uniqueSeasonKeys(
  rows: readonly { presetId: string | null; season: number }[],
): { presetId: string; season: number }[] {
  const seen = new Map<string, { presetId: string; season: number }>();
  for (const r of rows) {
    if (!r.presetId) continue;
    seen.set(`${r.presetId}:${r.season}`, { presetId: r.presetId, season: r.season });
  }
  return [...seen.values()].sort(
    (a, b) => a.presetId.localeCompare(b.presetId) || a.season - b.season,
  );
}
