import type { PermitActionTier } from "./action";
import { DISPLAY_STATE_SEVERITY, type PermitDisplayState } from "./status";

/**
 * Order and groups of the Genehmigungen list (2026-10-29): the default is "Antrag bis", earliest first,
 * split into what to apply for now, what can wait and what needs nothing from the office. Pure.
 */
export const PERMIT_SORTS = ["antrag", "ort", "status", "markt"] as const;
export type PermitSort = (typeof PERMIT_SORTS)[number];

export function isPermitSort(value: unknown): value is PermitSort {
  return typeof value === "string" && (PERMIT_SORTS as readonly string[]).includes(value);
}

type Sortable = {
  title: string;
  applyBy: string | null;
  state: PermitDisplayState;
  venueName: string | null;
  nextEventOn: string | null;
};

/** ISO dates sort as text; a missing date goes last. */
const dateKey = (value: string | null) => value ?? "9999-12-31~";

/** A sorted copy. Ties fall back to the apply-by date, then to the title, so the order is stable. */
export function sortPermits<T extends Sortable>(rows: readonly T[], sort: PermitSort): T[] {
  const byApply = (a: T, b: T) =>
    dateKey(a.applyBy).localeCompare(dateKey(b.applyBy)) || a.title.localeCompare(b.title, "de");
  const primary: Record<PermitSort, (a: T, b: T) => number> = {
    antrag: () => 0,
    ort: (a, b) => (a.venueName ?? "").localeCompare(b.venueName ?? "", "de"),
    status: (a, b) => DISPLAY_STATE_SEVERITY[a.state] - DISPLAY_STATE_SEVERITY[b.state],
    markt: (a, b) => dateKey(a.nextEventOn).localeCompare(dateKey(b.nextEventOn)),
  };
  return [...rows].sort((a, b) => primary[sort](a, b) || byApply(a, b));
}

/** The groups of the list when it is sorted by "Antrag bis". */
export type PermitListGroup = "now" | "later" | "other";

/**
 * Which group a permit belongs to: "now" = apply for it now (overdue or due within the horizon),
 * "later" = still to be applied for, not due yet, "other" = needs nothing from the office (filed,
 * granted, not needed) or no upcoming market asks for it. Same split as the sidebar badge.
 */
export function permitListGroup(row: {
  tier: PermitActionTier | null;
  upcomingEvents: number;
}): PermitListGroup {
  if (row.upcomingEvents === 0 || row.tier === null) return "other";
  return row.tier === "not_due" ? "later" : "now";
}
