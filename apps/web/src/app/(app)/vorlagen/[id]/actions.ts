"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  ensureEventSeason,
  SeasonInputError,
  setSeasonExpectedStart,
  setSeasonStatus,
} from "@/server/services/seasons";
import { requirePermission } from "@/server/session";

export type SeasonActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(call: () => Promise<T>): Promise<SeasonActionResult<T>> {
  try {
    const data = await call();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof SeasonInputError) {
      // The page may show an outdated season: make it current again.
      if (error.message === "conflict" || error.message === "season_not_found") refresh();
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/** "Saison anlegen" on the market page: the one path `ensureEventSeason`. */
export async function createSeasonAction(presetId: string, season: number) {
  await requirePermission("event", "write");
  const actor = await getActor();
  return run(() => ensureEventSeason(actor, presetId, season));
}

/** Saison status switch; the undo toast calls it back with the previous status. */
export async function setSeasonStatusAction(seasonId: string, to: string, expectedFrom: string) {
  await requirePermission("event", "write");
  const actor = await getActor();
  return run(() => setSeasonStatus(actor, seasonId, to, expectedFrom));
}

/** "Erwartet ab" while the season has no dates; the undo toast calls it back with the previous date. */
export async function setSeasonExpectedStartAction(
  seasonId: string,
  date: string,
  expectedFrom: string,
) {
  await requirePermission("event", "write");
  const actor = await getActor();
  return run(() => setSeasonExpectedStart(actor, seasonId, date, expectedFrom));
}
