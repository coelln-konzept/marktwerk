import "server-only";
import { addDays, overallHealth } from "@marktwerk/core";
import { upcomingWeekend } from "@marktwerk/core/dates/weekend";
import { dutyRole } from "@marktwerk/db/schema";
import { count } from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import { type EventRow, listEvents, listEventTypes } from "./events";

export type SeasonSummary = {
  year: number;
  count: number;
  /** Month numbers (1–12) of the first and last event, null without events. */
  firstMonth: number | null;
  lastMonth: number | null;
  byType: { key: string; nameDe: string; nameEn: string; n: number }[];
};

export type Overview = {
  season: SeasonSummary;
  /** Next season's planned events, only once the current season is (almost) over. */
  nextSeason: { year: number; count: number } | null;
  weekend: { saturday: string; sunday: string; rows: EventRow[]; duties: number };
  nextAfterWeekend: EventRow | null;
  kpis: {
    weekendCount: number;
    weekendInPlan: number;
    weekendTracked: number;
    next30: number;
    drafts: number;
  };
};

/** The season is "almost over" when at most this share of its events is still ahead. */
const SEASON_OVER_SHARE = 0.1;

/** Everything the Übersicht needs in M1: events only (tasks M2, permits M3, hours M4, money M5). */
export async function getOverview(actor: Actor, today: string): Promise<Overview> {
  const [all, types, [roles]] = await Promise.all([
    listEvents(actor, {}),
    listEventTypes(),
    db.select({ n: count() }).from(dutyRole),
  ]);
  const active = all.filter((e) => e.status !== "cancelled");
  const year = Number(today.slice(0, 4));

  const inSeason = active.filter((e) => e.season === year);
  const byType = types
    .map((t) => ({
      key: t.key,
      nameDe: t.nameDe,
      nameEn: t.nameEn,
      n: inSeason.filter((e) => e.typeKey === t.key).length,
    }))
    .filter((t) => t.n > 0);
  const months = inSeason.map((e) => Number(e.startsOn.slice(5, 7)));
  const upcomingInSeason = inSeason.filter((e) => e.endsOn >= today).length;
  const nextCount = active.filter((e) => e.season === year + 1).length;
  const over = inSeason.length === 0 || upcomingInSeason / inSeason.length <= SEASON_OVER_SHARE;

  const { saturday, sunday } = upcomingWeekend(today);
  const weekendRows = active.filter((e) => e.startsOn <= sunday && e.endsOn >= saturday);
  const tracked = weekendRows.filter((e) => overallHealth(e.health) !== null);
  const limit = addDays(today, 30);

  return {
    season: {
      year,
      count: inSeason.length,
      firstMonth: months.length ? Math.min(...months) : null,
      lastMonth: months.length ? Math.max(...months) : null,
      byType,
    },
    nextSeason: over && nextCount > 0 ? { year: year + 1, count: nextCount } : null,
    weekend: { saturday, sunday, rows: weekendRows, duties: roles?.n ?? 0 },
    nextAfterWeekend: active.find((e) => e.startsOn > sunday) ?? null,
    kpis: {
      weekendCount: weekendRows.length,
      weekendTracked: tracked.length,
      weekendInPlan: tracked.filter((e) => overallHealth(e.health) === "ok").length,
      next30: active.filter((e) => e.endsOn >= today && e.startsOn <= limit).length,
      drafts: all.filter((e) => e.status === "draft" && e.endsOn >= today).length,
    },
  };
}
