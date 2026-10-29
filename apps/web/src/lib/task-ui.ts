import type { BoardColumn, TaskStatusKey } from "@marktwerk/core";
import {
  Ban,
  Check,
  Circle,
  CircleDot,
  CirclePause,
  type LucideIcon,
  SkipForward,
  X,
} from "lucide-react";
import type { Tone } from "@/components/ui/status-badge";
import { isModuleHidden } from "@/lib/modules";

/** Task status → colour + icon (UX concept §7: Offen ○ · In Arbeit ◐ · Wartet ⏸ · Blockiert ⛔ · Erledigt ✓ · Übersprungen ⤼). */
export const TASK_STATUS_UI: Record<TaskStatusKey, { tone: Tone; icon: LucideIcon }> = {
  todo: { tone: "neutral", icon: Circle },
  in_progress: { tone: "info", icon: CircleDot },
  waiting_external: { tone: "waiting", icon: CirclePause },
  blocked: { tone: "warn", icon: Ban },
  done: { tone: "ok", icon: Check },
  skipped: { tone: "neutral", icon: SkipForward },
  cancelled: { tone: "neutral", icon: X },
};

/** Statuses a person can set by hand (cancelled is not offered). */
export const SETTABLE_STATUSES = [
  "todo",
  "in_progress",
  "waiting_external",
  "blocked",
  "done",
  "skipped",
] as const satisfies readonly TaskStatusKey[];

/** Statuses that ask for a reason first (skipped needs one, the others take one). */
export const REASON_STATUSES = ["waiting_external", "blocked", "skipped"] as const;

export const TASK_CATEGORIES = [
  "general",
  "permits",
  "logistics",
  "communication",
  "finance",
  "staff",
  "office",
] as const;

/**
 * Categories offered as filter chips. "Team" and "Finanzen" go while those modules are hidden
 * (lib/modules.ts); tasks of those categories still exist and still show.
 */
export function filterCategories(): (typeof TASK_CATEGORIES)[number][] {
  return TASK_CATEGORIES.filter(
    (c) =>
      !(c === "staff" && isModuleHidden("team")) && !(c === "finance" && isModuleHidden("finance")),
  );
}

/** Most urgent first (UX pass 2026-10-22): Überfällig & heute, Diese Woche, Später, Erledigt. */
export const COLUMN_ORDER: BoardColumn[] = ["today", "this_week", "preparation", "done"];

/** "45 min", "2 h", "1,5 h" (minutes in). */
export function formatEstimate(minutes: number, locale: string): string {
  if (minutes <= 0) return "–";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  const text = new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE", {
    maximumFractionDigits: 2,
  }).format(hours);
  return `${text} h`;
}

/** Hours with at most one decimal: "12,5 h". */
export function formatHours(hours: number, locale: string): string {
  const text = new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE", {
    maximumFractionDigits: 1,
  }).format(hours);
  return `${text} ${locale === "en" ? "h" : "Std."}`;
}
