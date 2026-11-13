import "server-only";
import { can, type SeasonEventDates, seasonAnchors } from "@marktwerk/core";
import { event, eventSeason } from "@marktwerk/db/schema";
import {
  type EnsuredSeason,
  ensureEventSeasonTx,
  type SeasonSource,
  seasonEventDates,
  uniqueSeasonKeys,
  writeSeasonAnchors,
} from "@marktwerk/jobs/seasons";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "../../lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { planTaskShift, type ShiftedTask, shiftTasks } from "./task-schedule";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;

export class SeasonInputError extends Error {}

/** A market's season: (preset, calendar year). */
export type SeasonKey = { presetId: string; season: number };

/**
 * `ensureEventSeason(presetId, season)` (research 13 §6.2): makes sure the market has its Saison record for that
 * year. Permission check → transaction → `ensureEventSeasonTx` (the one path, @marktwerk/jobs: record, anchors,
 * season items, audit `season.create`). Idempotent: an existing record is returned unchanged.
 */
export async function ensureEventSeason(
  actor: Actor,
  presetId: string,
  season: number,
): Promise<EnsuredSeason> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!UUID.test(presetId)) throw new SeasonInputError("preset_not_found");
  if (!Number.isInteger(season) || season < 1900 || season > 9999)
    throw new SeasonInputError("invalid_season");
  return db.transaction(async (tx) => {
    const preset = await tx.query.eventPreset.findFirst({
      where: (p, { eq }) => eq(p.id, presetId),
      columns: { id: true },
    });
    if (!preset) throw new SeasonInputError("preset_not_found");
    return ensureEventSeasonTx(tx, actor, presetId, season, {
      today: todayIn(),
      source: "manual",
    });
  });
}

/**
 * Inside a caller's transaction that already checked `event:write` ("Markt planen", moving an event): the Saison
 * records of these (market, year) pairs exist afterwards.
 */
export async function ensureSeasonsTx(
  tx: Tx,
  actor: Actor,
  keys: readonly SeasonKey[],
  source: SeasonSource,
): Promise<EnsuredSeason[]> {
  const today = todayIn();
  const result: EnsuredSeason[] = [];
  for (const key of keys)
    result.push(await ensureEventSeasonTx(tx, actor, key.presetId, key.season, { today, source }));
  return result;
}

/** What changed a season's dates (written to the audit entry). */
export type SeasonDatesCause =
  | "event_create"
  | "event_move"
  | "event_update"
  | "event_status"
  | "event_delete"
  | "event_archive";

/** The anchors that exist (a null `season_end` has no row), as the shift path reads them. */
const anchorMap = (anchors: Record<string, string | null>) =>
  new Map(Object.entries(anchors).filter((e): e is [string, string] => e[1] !== null));

const activeSeason = async (x: Pick<typeof db, "select">, key: SeasonKey) => {
  const [row] = await x
    .select({ id: eventSeason.id, expectedStart: eventSeason.expectedStart })
    .from(eventSeason)
    .where(
      and(
        eq(eventSeason.presetId, key.presetId),
        eq(eventSeason.season, key.season),
        isNull(eventSeason.archivedAt),
      ),
    );
  return row;
};

export type SeasonSync = { seasonId: string; shifted: ShiftedTask[] };

/**
 * Anchors move with the dates (research 13 §6.2, Fahrplan R10): after an event of these seasons was created,
 * moved, cancelled, reopened, deleted or archived, `season_start` / `season_end` are recomputed from the season's
 * events (`seasonAnchors`) and the open, not overridden season tasks follow through the one shift path
 * (`shiftTasks`, done tasks never move). Inside the caller's transaction, which checked the permission; audited as
 * `season.anchors` with the anchor diff when something changed. Seasons without a record (or archived ones) are
 * left alone; their record is made with the right anchors when it is created.
 */
export async function syncSeasonsTx(
  tx: Tx,
  actor: Actor,
  /** Seasons to recompute; events without a market (`presetId` null) are skipped. */
  keys: readonly { presetId: string | null; season: number }[],
  cause: SeasonDatesCause,
): Promise<SeasonSync[]> {
  const result: SeasonSync[] = [];
  for (const key of uniqueSeasonKeys(keys)) {
    const row = await activeSeason(tx, key);
    if (!row) continue;
    const next = seasonAnchors(
      await seasonEventDates(tx, key.presetId, key.season),
      row.expectedStart,
    );
    const anchors = await writeSeasonAnchors(tx, row.id, next);
    if (Object.keys(anchors).length === 0) continue;
    const shifted = await shiftTasks(tx, { seasonId: row.id }, anchorMap(next));
    await audit(tx, actor.id, [
      {
        action: "season.anchors",
        entityType: "event_season",
        entityId: row.id,
        diff: {
          presetId: key.presetId,
          season: key.season,
          anchors,
          cause,
          ...(shifted.length > 0 ? { tasksShifted: shifted.length } : {}),
        },
      },
    ]);
    result.push({ seasonId: row.id, shifted });
  }
  return result;
}

/**
 * Preview for "Verschieben": which season tasks would get a new due date if the event had `next` as its days.
 * Same rules and shift plan as `syncSeasonsTx`; nothing is written. A season without a record has no tasks yet.
 */
export async function planSeasonShiftForMove(
  x: Pick<typeof db, "select" | "update">,
  current: {
    id: string;
    presetId: string | null;
    season: number;
    status: string;
  },
  next: { startsOn: string; endsOn: string },
): Promise<ShiftedTask[]> {
  if (!current.presetId) return [];
  const presetId = current.presetId;
  const nextSeason = Number(next.startsOn.slice(0, 4));
  const shifted: ShiftedTask[] = [];
  for (const key of uniqueSeasonKeys([
    { presetId, season: current.season },
    { presetId, season: nextSeason },
  ])) {
    const row = await activeSeason(x, key);
    if (!row) continue;
    const others = await x
      .select({
        id: event.id,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        status: event.status,
      })
      .from(event)
      .where(
        and(eq(event.presetId, presetId), eq(event.season, key.season), isNull(event.archivedAt)),
      );
    const dates: SeasonEventDates[] = others.filter((e) => e.id !== current.id);
    if (key.season === nextSeason) dates.push({ ...next, status: current.status });
    const anchors = seasonAnchors(dates, row.expectedStart);
    shifted.push(...(await planTaskShift(x, { seasonId: row.id }, anchorMap(anchors))));
  }
  return shifted;
}
