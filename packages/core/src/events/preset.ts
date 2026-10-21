import { checkEventTimes, type EventTimesInput, isClockTime, MAX_PRICE_CENTS } from "./details";
import { parseRRule } from "./rrule";

/*
 * Rules for the fields of an event preset ("Vorlage") that need no database: shared by the form
 * (inline errors) and the service (the authoritative check), so both say the same thing.
 */

export const PRESET_NAME_MAX = 120;
export const PRESET_PUBLIC_TITLE_MAX = 200;
export const PRESET_PUBLIC_TEXT_MAX = 5000;
export const PRESET_MAX_DURATION_DAYS = 14;
const RRULE_MAX = 200;

export type PresetFieldsInput = {
  name: string;
  durationDays: number;
  publicTitle: string | null;
  publicText: string | null;
  times: EventTimesInput;
  pricePerMCents: number;
  bookingFeeCents: number;
  rrule: string | null;
};

export type PresetIssueCode =
  | "invalid_name"
  | "invalid_duration"
  | "invalid_public_title"
  | "invalid_public_text"
  | "invalid_time"
  | "open_after_close"
  | "close_after_teardown"
  | "setup_after_open"
  | "invalid_price"
  | "invalid_fee"
  | "invalid_rrule";

/** The form field an issue belongs to. */
export type PresetIssueField =
  | "name"
  | "duration"
  | "publicTitle"
  | "publicText"
  | "setup"
  | "open"
  | "close"
  | "teardown"
  | "price"
  | "fee"
  | "rrule";

export type PresetIssue = { code: PresetIssueCode; field: PresetIssueField };

const TIME_KEYS = ["setup", "open", "close", "teardown"] as const;

const validCents = (cents: number) =>
  Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_PRICE_CENTS;

/** Every problem in the fields that don't need the database; empty = fine. */
export function checkPresetFields(input: PresetFieldsInput): PresetIssue[] {
  const issues: PresetIssue[] = [];
  const name = input.name.trim();
  if (name.length < 1 || name.length > PRESET_NAME_MAX)
    issues.push({ code: "invalid_name", field: "name" });
  if (
    !Number.isInteger(input.durationDays) ||
    input.durationDays < 1 ||
    input.durationDays > PRESET_MAX_DURATION_DAYS
  )
    issues.push({ code: "invalid_duration", field: "duration" });
  if (input.publicTitle !== null && input.publicTitle.length > PRESET_PUBLIC_TITLE_MAX)
    issues.push({ code: "invalid_public_title", field: "publicTitle" });
  if (input.publicText !== null && input.publicText.length > PRESET_PUBLIC_TEXT_MAX)
    issues.push({ code: "invalid_public_text", field: "publicText" });

  const badTime = TIME_KEYS.find((key) => !isClockTime(input.times[key]));
  if (badTime) {
    issues.push({ code: "invalid_time", field: badTime });
  } else {
    const timesError = checkEventTimes(input.times, input.durationDays > 1);
    if (timesError === "open_after_close") issues.push({ code: timesError, field: "close" });
    else if (timesError === "close_after_teardown")
      issues.push({ code: timesError, field: "teardown" });
    else if (timesError === "setup_after_open") issues.push({ code: timesError, field: "setup" });
    else if (timesError) issues.push({ code: "invalid_time", field: "open" });
  }

  if (!validCents(input.pricePerMCents)) issues.push({ code: "invalid_price", field: "price" });
  if (!validCents(input.bookingFeeCents)) issues.push({ code: "invalid_fee", field: "fee" });

  if (input.rrule !== null) {
    try {
      if (input.rrule.length > RRULE_MAX) throw new Error("too long");
      parseRRule(input.rrule);
    } catch {
      issues.push({ code: "invalid_rrule", field: "rrule" });
    }
  }
  return issues;
}

/**
 * Basis of a preset's unique `key`: lower-case ASCII slug of the name ("Frühjahrs-Flohmarkt" →
 * "fruehjahrs-flohmarkt"), at most 60 characters; "vorlage" if nothing is left.
 */
export function presetKeyBase(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "vorlage";
}
