import { addDays, daysBetween, isoDate } from "../dates/calendar";

/*
 * Jahresübersicht (Fahrplan R22, research 13 G2): the office's paper wall calendar as a Kalender view. Twelve
 * month grids, every market date a dot in the market colour with its Kürzel, and a legend of the markets that
 * doubles as a filter. These are the pure parts: which dots go on which day, what the legend lists, and the
 * URL value of the hidden markets.
 */

/** Legend key of the events without a market (Einzeltermine); markets use their preset id. */
export const SINGLE_EVENTS_KEY = "einzel";

/** What the Jahresübersicht needs of an event. */
export type YearEvent = {
  id: string;
  /** The event's market (preset), null for an Einzeltermin. */
  presetId: string | null;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
};

/** The legend key of an event: its market, or {@link SINGLE_EVENTS_KEY}. */
export function yearLegendKey(event: { presetId: string | null }): string {
  return event.presetId ?? SINGLE_EVENTS_KEY;
}

/** One dot: an event on one of its days (`index` of `total` for events longer than a day). */
export type YearDot<E> = { event: E; index: number; total: number };

/**
 * The dots of each day of `year` (date → dots): one per event and day, so a three-day Altstadt has three
 * dots; days outside the year are left out (an event over New Year shows its days in both years). Within a
 * day the order is stable: by start, then name, then id (an event that started earlier stays first).
 */
export function yearDots<E extends YearEvent>(
  events: readonly E[],
  year: number,
): Map<string, YearDot<E>[]> {
  const first = isoDate(year, 1, 1);
  const last = isoDate(year, 12, 31);
  const ordered = [...events].sort(
    (a, b) =>
      a.startsOn.localeCompare(b.startsOn) ||
      a.name.localeCompare(b.name, "de") ||
      a.id.localeCompare(b.id),
  );
  const byDay = new Map<string, YearDot<E>[]>();
  for (const event of ordered) {
    if (event.endsOn < event.startsOn) continue;
    const total = daysBetween(event.startsOn, event.endsOn) + 1;
    const from = event.startsOn < first ? first : event.startsOn;
    const to = event.endsOn > last ? last : event.endsOn;
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const dot = { event, index: daysBetween(event.startsOn, day) + 1, total };
      const list = byDay.get(day);
      if (list) list.push(dot);
      else byDay.set(day, [dot]);
    }
  }
  return byDay;
}

/** A market as the legend needs it. */
export type YearLegendMarket = { id: string; name: string; active: boolean };

/** One legend line: a market (or the Einzeltermine) and how many dates it has in the year. */
export type YearLegendEntry<M, E> = {
  /** Preset id, or {@link SINGLE_EVENTS_KEY}. */
  key: string;
  /** The market; null for the Einzeltermine and for a market that is no longer listed (archived). */
  market: M | null;
  /** The market's name; an archived market is named after its first event. Empty for the Einzeltermine. */
  name: string;
  /** Events in the year that are not cancelled. */
  count: number;
  /** Its first event in the year (colour and type of an archived market), if any. */
  sample: E | null;
};

/**
 * The legend of the Jahresübersicht, like the one on the wall: every active market, also those without a
 * date in the year yet (unless `includeEmpty` is false), plus every other market that has dates in it
 * (inactive, archived), in name order; the Einzeltermine last, only when there are any. `count` leaves
 * cancelled events out.
 */
export function yearLegend<M extends YearLegendMarket, E extends YearEvent>(
  markets: readonly M[],
  events: readonly E[],
  { includeEmpty = true }: { includeEmpty?: boolean } = {},
): YearLegendEntry<M, E>[] {
  const byKey = new Map<string, E[]>();
  for (const event of events) {
    const key = yearLegendKey(event);
    const list = byKey.get(key);
    if (list) list.push(event);
    else byKey.set(key, [event]);
  }
  const firstOf = (list: E[] | undefined): E | null =>
    list && list.length > 0
      ? ([...list].sort(
          (a, b) => a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id),
        )[0] as E)
      : null;
  const countOf = (list: E[] | undefined) =>
    (list ?? []).filter((e) => e.status !== "cancelled").length;

  const entries: YearLegendEntry<M, E>[] = [];
  const listed = new Set<string>();
  for (const market of markets) {
    listed.add(market.id);
    const list = byKey.get(market.id);
    if (!list && !(includeEmpty && market.active)) continue;
    entries.push({
      key: market.id,
      market,
      name: market.name,
      count: countOf(list),
      sample: firstOf(list),
    });
  }
  for (const [key, list] of byKey) {
    if (key === SINGLE_EVENTS_KEY || listed.has(key)) continue;
    const sample = firstOf(list);
    entries.push({ key, market: null, name: sample?.name ?? "", count: countOf(list), sample });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, "de") || a.key.localeCompare(b.key));
  const single = byKey.get(SINGLE_EVENTS_KEY);
  if (single)
    entries.push({
      key: SINGLE_EVENTS_KEY,
      market: null,
      name: "",
      count: countOf(single),
      sample: firstOf(single),
    });
  return entries;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The markets switched off in the legend, from the URL (`?ohne=<id>,<id>,einzel`): preset ids and
 * {@link SINGLE_EVENTS_KEY}, anything else dropped, no duplicates, sorted (one URL per selection).
 */
export function parseHiddenMarkets(value: string | readonly string[] | undefined): string[] {
  const raw = ([] as string[]).concat(value ?? []).flatMap((v) => v.split(","));
  const keys = raw
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k === SINGLE_EVENTS_KEY || UUID.test(k));
  return [...new Set(keys)].sort();
}

/** The `ohne` value after switching one market on or off; undefined when nothing stays hidden. */
export function toggleHiddenMarket(hidden: readonly string[], key: string): string | undefined {
  const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
  return parseHiddenMarkets(next.join(",")).join(",") || undefined;
}
