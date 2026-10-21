/** Seed for every run. Changing it changes all generated output. */
export const SEED = 20261021;

/** "Today" for every status and due-date decision. The real clock is never read. */
export const REFERENCE_DATE = "2026-10-21";

export const COMPANY_NAME = "Demo Märkte GmbH";
export const TIME_ZONE = "Europe/Berlin";
export const GENERATOR_NAME = "@marktwerk/synthetic";

/** Seasons that get events. 2027 is planned, not yet permitted. */
export const SEASONS = [2026, 2027] as const;

/** Hard business rule: at most this many events may touch one weekend. */
export const MAX_EVENTS_PER_WEEKEND = 4;

/** Minimum wage and Minijob limit for 2026, also stored as legal_parameter rows. */
export const MINIJOB_LIMIT_2026_CENTS = 60300;
