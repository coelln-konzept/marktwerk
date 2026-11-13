import "server-only";
import { can } from "@marktwerk/core";
import {
  type EnsuredSeason,
  ensureEventSeasonTx,
  type SeasonSource,
} from "@marktwerk/jobs/seasons";
import { forbidden } from "next/navigation";
import { todayIn } from "../../lib/format";
import type { Actor } from "../actor";
import { db } from "../db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;

export class SeasonInputError extends Error {}

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
  keys: readonly { presetId: string; season: number }[],
  source: SeasonSource,
): Promise<EnsuredSeason[]> {
  const today = todayIn();
  const result: EnsuredSeason[] = [];
  for (const key of keys)
    result.push(await ensureEventSeasonTx(tx, actor, key.presetId, key.season, { today, source }));
  return result;
}
