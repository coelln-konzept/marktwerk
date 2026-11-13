import { type ScheduleRow, scheduleSummary } from "@marktwerk/core";

/** "08"–"16" for full hours, else "08:30"–"16:00" (both ends alike). */
export function hourRange(from: string, to: string): { from: string; to: string } {
  const full = (time: string) => time.endsWith(":00");
  return full(from) && full(to) ? { from: from.slice(0, 2), to: to.slice(0, 2) } : { from, to };
}

/** The keys of the `schedule` namespace the summary needs (server and client translators both fit). */
type SummaryTranslator = (
  key: "summary.hours" | "summary.setup" | "summary.setupBefore" | "summary.noHours",
  values?: Record<string, string>,
) => string;

/**
 * The compact Zeitplan summary for places where space is short (ADR 0022): visitor hours of the first
 * day + earliest vendor setup, "08–16 Uhr · Aufbau ab 06:00" or "… · Aufbau ab Vortag 18:00".
 * `t` = the `schedule` namespace.
 */
export function formatScheduleSummary(rows: readonly ScheduleRow[], t: SummaryTranslator): string {
  const summary = scheduleSummary(rows);
  const parts = [
    summary.open
      ? t("summary.hours", hourRange(summary.open.from, summary.open.to))
      : t("summary.noHours"),
  ];
  if (summary.earliestSetup)
    parts.push(
      t(summary.earliestSetupDay === "before" ? "summary.setupBefore" : "summary.setup", {
        time: summary.earliestSetup,
      }),
    );
  return parts.join(" · ");
}

/** Visitor hours of the first day only ("08–16 Uhr"), for lines that already say more. */
export function formatVisitorHours(rows: readonly ScheduleRow[], t: SummaryTranslator): string {
  const { open } = scheduleSummary(rows);
  return open ? t("summary.hours", hourRange(open.from, open.to)) : t("summary.noHours");
}
