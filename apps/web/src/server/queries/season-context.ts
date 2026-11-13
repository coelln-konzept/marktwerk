import "server-only";
import { can } from "@marktwerk/core";
import { eventPreset, eventSeason, eventType } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import type { TaskSeason } from "./due";

/**
 * The Saison of a season task with its market (research 13 §6.3), for a left join on `task.season_id`:
 * `.leftJoin(sc, eq(sc.seasonId, task.seasonId))` with `const sc = seasonContext()`. One join per list query,
 * so a list never asks once per task.
 */
export function seasonContext() {
  return db
    .select({
      seasonId: eventSeason.id,
      seasonYear: eventSeason.season,
      seasonPresetId: eventSeason.presetId,
      seasonName: eventPreset.name,
      seasonColor: eventPreset.color,
      seasonTypeKey: eventType.key,
    })
    .from(eventSeason)
    .innerJoin(eventPreset, eq(eventPreset.id, eventSeason.presetId))
    .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
    .as("season_ctx");
}

/** The columns of {@link seasonContext} as a list row carries them (null when the task has no season). */
export type SeasonColumns = {
  seasonId: string | null;
  seasonYear: number | null;
  seasonPresetId: string | null;
  seasonName: string | null;
};

/**
 * A row's season as the lists show it, or null for a task without one. The market page needs `template:write`,
 * so the link is left out for everybody else (the label stays).
 */
export function toTaskSeason(actor: Actor, r: SeasonColumns): TaskSeason | null {
  if (!r.seasonId || r.seasonYear === null || !r.seasonPresetId || r.seasonName === null)
    return null;
  return {
    id: r.seasonId,
    year: r.seasonYear,
    presetId: r.seasonPresetId,
    name: r.seasonName,
    href: can(actor.role, "template", "write") ? `/vorlagen/${r.seasonPresetId}` : null,
  };
}
