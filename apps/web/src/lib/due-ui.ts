import { type TaskStatusKey, taskDueness } from "@marktwerk/core";
import {
  AlarmClockOff,
  CalendarDays,
  Check,
  Clock,
  Hourglass,
  type LucideIcon,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import type { Tone } from "@/components/ui/status-badge";

/*
 * The one status vocabulary for due dates (decision 2026-10-26, UX concept §7). Every screen shows due-ness
 * with these icons, tones and texts (`tasks.due` messages); nothing else may mean "überfällig".
 * - Überfällig: red octagon, "Überfällig · 3 Tage" (counts: "6 überfällig")
 * - Heute: amber clock · Morgen / in 2–7 Tagen: neutral calendar · later: the date only
 * - Wartet (somebody else has to act): purple hourglass, "Wartet seit Mo 19.10." — never red
 * - Zurückgestellt: crossed-out alarm clock
 * - Erledigt: green check
 * The triangle only means a general warning ("check this"), never a date. Health shapes (● ▲ ■ ○) only show a
 * market's overall state.
 */

export type DueState =
  | { kind: "overdue"; days: number }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "soon"; days: number }
  | { kind: "later"; dueOn: string }
  | { kind: "waiting"; since: string }
  | { kind: "done"; on: string | null }
  | { kind: "none" };

export const DUE_UI: Record<DueState["kind"], { tone: Tone; icon: LucideIcon | null }> = {
  overdue: { tone: "critical", icon: OctagonAlert },
  today: { tone: "warn", icon: Clock },
  tomorrow: { tone: "neutral", icon: CalendarDays },
  soon: { tone: "neutral", icon: CalendarDays },
  later: { tone: "neutral", icon: null },
  waiting: { tone: "waiting", icon: Hourglass },
  done: { tone: "ok", icon: Check },
  none: { tone: "neutral", icon: null },
};

/** The icon for "überfällig" (counts, legends, group headers). */
export const OVERDUE_ICON = OctagonAlert;
/** The icon for snoozed ("Zurückgestellt") items. */
export const SNOOZED_ICON = AlarmClockOff;
/** The icon for a general warning ("check this"), never for a date. */
export const WARNING_ICON = TriangleAlert;

/**
 * Due state of anything with a due day. Pass `status` for tasks: finished ones say when they were done, and a
 * task waiting on somebody else past its date is "waiting", not overdue.
 */
export function dueStateOf(input: {
  dueOn: string | null;
  today: string;
  status?: TaskStatusKey;
  completedOn?: string | null;
}): DueState {
  const { dueOn, today, status } = input;
  if (status === "done" || status === "skipped")
    return { kind: "done", on: input.completedOn ?? null };
  const d = taskDueness({ status: status ?? "todo", dueOn }, today);
  switch (d.kind) {
    case "none":
      return { kind: "none" };
    case "waiting_since":
      return { kind: "waiting", since: d.since };
    case "overdue":
      return { kind: "overdue", days: d.days };
    case "today":
      return { kind: "today" };
    case "soon":
      return d.days === 1 ? { kind: "tomorrow" } : { kind: "soon", days: d.days };
    default:
      return { kind: "later", dueOn: dueOn as string };
  }
}
