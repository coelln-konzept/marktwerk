/** Seed for every run. Changing it changes all generated output. */
export const SEED = 20261021;

/** The fixed "today" of the tests and of runs without an explicit date. */
export const DEFAULT_REFERENCE_DATE = "2026-10-21";

/**
 * "Today" for every status and due-date decision. The generator never reads the real clock: the seed passes
 * the seed day as `SYNTHETIC_REFERENCE_DATE` (so a fresh seed looks current), tests use the fixed default.
 */
export const REFERENCE_DATE = referenceDate(process.env.SYNTHETIC_REFERENCE_DATE);

function referenceDate(value: string | undefined): string {
  if (value === undefined || value === "") return DEFAULT_REFERENCE_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    throw new Error(`SYNTHETIC_REFERENCE_DATE must be YYYY-MM-DD, got "${value}"`);
  return value;
}

export const COMPANY_NAME = "Demo Märkte GmbH";
export const TIME_ZONE = "Europe/Berlin";
export const GENERATOR_NAME = "@marktwerk/synthetic";

/**
 * The two seasons that get events for a reference date: the current year and the next. Everything season-based in
 * the generators derives from this (see `lib/clock.ts`), never from a calendar literal.
 */
export function seasonsFor(today: string): readonly [number, number] {
  const year = Number(today.slice(0, 4));
  return [year, year + 1];
}

/** Seasons for the default (env-driven) reference date. Generators use the `Clock` of their run instead. */
export const SEASONS = seasonsFor(REFERENCE_DATE);

/** Hard business rule: at most this many events may touch one weekend. */
export const MAX_EVENTS_PER_WEEKEND = 4;

/** Minijob limit per year (also stored as legal_parameter rows). Years without a row use the latest known. */
export const MINIJOB_LIMIT_CENTS_BY_YEAR: Readonly<Record<number, number>> = {
  2026: 60300,
  2027: 63300,
};

export function minijobLimitCents(year: number): number {
  const known = Object.keys(MINIJOB_LIMIT_CENTS_BY_YEAR).map(Number);
  const usable = known.filter((y) => y <= year);
  const key = usable.length > 0 ? Math.max(...usable) : Math.min(...known);
  return MINIJOB_LIMIT_CENTS_BY_YEAR[key] ?? 60300;
}
