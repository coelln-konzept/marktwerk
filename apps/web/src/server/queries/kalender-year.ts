import "server-only";
import { isoDate, SINGLE_EVENTS_KEY, yearLegend } from "@marktwerk/core";
import { eventPreset, eventType } from "@marktwerk/db/schema";
import { asc, eq, isNull } from "drizzle-orm";
import type { Layers } from "@/components/kalender/layers";
import type { Actor } from "../actor";
import { db } from "../db";
import type { EventRow } from "./events";
import { listCalendarEvents } from "./kalender";
import { getMarketShortCodes } from "./market-short-codes";

/** The non-archived markets with what the legend shows of them (colour, type, venue for the Ort narrowing). */
export async function listLegendMarkets() {
  return db
    .select({
      id: eventPreset.id,
      name: eventPreset.name,
      active: eventPreset.active,
      color: eventPreset.color,
      typeKey: eventType.key,
      venueId: eventPreset.venueId,
    })
    .from(eventPreset)
    .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
    .where(isNull(eventPreset.archivedAt))
    .orderBy(asc(eventPreset.name));
}

/** One line of the Jahresübersicht's legend (and filter). */
export type YearLegendRow = {
  /** Preset id, or `SINGLE_EVENTS_KEY` for the Einzeltermine. */
  key: string;
  /** The market's name; empty for the Einzeltermine (the page names them). */
  name: string;
  /** The market's Kürzel (`getMarketShortCodes`); null for the Einzeltermine and archived markets. */
  code: string | null;
  color: string | null;
  typeKey: string | null;
  /** Events in the year that are not cancelled (after the type layers and the narrowing). */
  count: number;
};

/**
 * The Jahresübersicht (Fahrplan R22): the events of `year` with the Kalender's narrowing (Ort, Achtung/
 * Kritisch, meine Zuständigkeit; `rows`, for the type counts of the Ebenen panel), those of the shown types
 * (`events`), and the legend: every active market of the shown types (at the chosen Ort) with its colour,
 * Kürzel and number of dates, plus markets with dates that are inactive or archived, and the Einzeltermine.
 * While "Nur Achtung und Kritisch" or "Nur meine Zuständigkeit" narrows, markets without a date are left
 * out. The hidden markets (`?ohne=`) are the page's business: the legend lists them all.
 * Callers have passed `requirePermission("event", "read")`.
 */
export async function getCalendarYear(
  actor: Actor,
  year: number,
  layers: Pick<Layers, "types" | "venue" | "critical" | "mine">,
): Promise<{ rows: EventRow[]; events: EventRow[]; legend: YearLegendRow[] }> {
  const range = { from: isoDate(year, 1, 1), to: isoDate(year, 12, 31) };
  const [rows, markets, codes] = await Promise.all([
    listCalendarEvents(actor, range, layers),
    listLegendMarkets(),
    getMarketShortCodes(),
  ]);
  const events = rows.filter((r) => layers.types.includes(r.typeKey));
  // A market without a date stays in the legend only when it is of a shown type (and at the chosen Ort).
  const offered = new Set(
    markets
      .filter(
        (m) => layers.types.includes(m.typeKey) && (!layers.venue || m.venueId === layers.venue),
      )
      .map((m) => m.id),
  );
  const legend = yearLegend(markets, events, { includeEmpty: !layers.critical && !layers.mine })
    .filter((entry) => entry.sample !== null || offered.has(entry.key))
    .map(
      (entry): YearLegendRow => ({
        key: entry.key,
        name: entry.name,
        code: entry.key === SINGLE_EVENTS_KEY ? null : (codes.get(entry.key) ?? null),
        color: entry.market?.color ?? entry.sample?.color ?? null,
        typeKey: entry.market?.typeKey ?? entry.sample?.typeKey ?? null,
        count: entry.count,
      }),
    );
  return { rows, events, legend };
}
