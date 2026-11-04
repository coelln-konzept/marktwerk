/**
 * Two-step booking (spec 2026-11-04): a stall is *reserved* when the Platzkarte goes out and becomes
 * *fixed* once a person sees the transfer. Unpaid reservations get one reminder and are released after
 * the due date (fixed rules, ADR 0014 amendment). Dates are "YYYY-MM-DD" in Europe/Berlin; working days
 * are Mon–Fri without NRW public holidays.
 */
import { dueDateForNrw } from "../tasks/due";

export interface PaymentRules {
  /** Working days the vendor has to pay after the Platzkarte. */
  paymentDays: number;
  /** Working days before the due date that the reminder goes out. */
  reminderDaysBefore: number;
}

export const DEFAULT_PAYMENT_RULES: PaymentRules = { paymentDays: 4, reminderDaysBefore: 2 };

/**
 * `reservedOn` plus `paymentDays` working days, but never on or after the market day: then it is the
 * last working day before the market. If even that is before the reservation (booked a day before the
 * market), the market day itself; a person decides on site.
 */
export function paymentDueDate(
  reservedOn: string,
  marketDate: string,
  paymentDays: number,
): string {
  const due = dueDateForNrw(reservedOn, Math.max(0, Math.trunc(paymentDays)), "business");
  if (due < marketDate) return due;
  const lastBefore = dueDateForNrw(marketDate, -1, "business");
  return lastBefore >= reservedOn ? lastBefore : marketDate;
}

/**
 * The reminder day: `daysBefore` working days before the due date (0 = on the due date). Null when that
 * is not after the reservation day, so a vendor never gets a reminder together with the Platzkarte.
 */
export function reminderDate(reservedOn: string, dueOn: string, daysBefore: number): string | null {
  const day = dueDateForNrw(dueOn, -Math.max(0, Math.trunc(daysBefore)), "business");
  return day > reservedOn ? day : null;
}

/** Event-type and filler words that say nothing about which market it is. */
const SKIP = new Set([
  "flohmarkt",
  "antikmarkt",
  "trödelmarkt",
  "troedelmarkt",
  "stadtfest",
  "markt",
  "food",
  "wine",
  "am",
  "im",
  "an",
  "auf",
  "in",
  "der",
  "die",
  "das",
  "dem",
  "den",
  "und",
  "mit",
  "zum",
  "zur",
  "von",
  "vor",
]);

const fold = (s: string) =>
  s
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .normalize("NFD")
    .replace(/[^A-Z0-9]/g, "");

/**
 * The payment reference for one Platzkarte, e.g. "Flohmarkt Riehler Gürtel", 12.11., B-13 →
 * "RG-1211-B13": short enough to type, readable on a bank statement, and matchable later (M10).
 * Only A–Z, 0–9 and "-", at most 20 characters.
 */
export function paymentReference(input: {
  eventName: string;
  marketDate: string;
  stallNumber: string;
}): string {
  const words = input.eventName
    .split(/[\s\-–/&,.]+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()))
    .map(fold)
    .filter(Boolean);
  const code =
    words.length === 0
      ? "CK"
      : words.length === 1
        ? (words[0] ?? "").slice(0, 2)
        : words
            .map((w) => w[0])
            .join("")
            .slice(0, 4);
  const [, month, day] = input.marketDate.split("-");
  const stall = fold(input.stallNumber);
  const tail = `-${day}${month}-${stall}`;
  return `${code.slice(0, Math.max(1, 20 - tail.length))}${tail}`.slice(0, 20);
}

export interface SweepEntry {
  id: string;
  dueOn: string;
  reminderOn: string | null;
  remindedOn?: string;
  paidOn?: string;
}

/**
 * What the daily run does on `today`: release every unpaid reservation whose due date has passed;
 * remind the others once, from their reminder day on. Paid (fixed) entries are left alone.
 */
export function sweepReservations(
  list: readonly SweepEntry[],
  today: string,
): { remind: string[]; release: string[] } {
  const remind: string[] = [];
  const release: string[] = [];
  for (const r of list) {
    if (r.paidOn) continue;
    if (today > r.dueOn) release.push(r.id);
    else if (r.reminderOn && !r.remindedOn && today >= r.reminderOn) remind.push(r.id);
  }
  return { remind, release };
}
