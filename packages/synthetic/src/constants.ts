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

/** Seasons that get events. 2027 is planned, not yet permitted. */
export const SEASONS = [2026, 2027] as const;

/** Hard business rule: at most this many events may touch one weekend. */
export const MAX_EVENTS_PER_WEEKEND = 4;

/** Minimum wage and Minijob limit for 2026, also stored as legal_parameter rows. */
export const MINIJOB_LIMIT_2026_CENTS = 60300;
