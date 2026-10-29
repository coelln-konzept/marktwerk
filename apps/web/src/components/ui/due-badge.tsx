import { addDays, type DayDistance, DISTANCE_DAYS_MAX, dayDistance } from "@marktwerk/core";
import { CalendarDays, CircleAlert, Clock, Hourglass } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { formatDateShortYear, formatDateWithWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * One due vocabulary for every screen (decision 2026-10-29): words, not "3 T" ("Heute", "Morgen",
 * "In 3 Tagen", "3 Tage überfällig", "Wartet seit 5 Tagen"), weeks after 14 days, months after 59.
 * Overdue is always red with the circle "!", today amber with the clock, future dates neutral, a
 * wait for somebody else neutral with the hourglass. The absolute date is the tooltip, or comes first
 * with `withDate`. Works in server and client components (next-intl hooks).
 */

export type DueState = "overdue" | "today" | "future" | "waiting";

/** `waiting`: the task waits for somebody else (only counts once the due date has passed). */
export function dueState(dueOn: string, today: string, waiting = false): DueState {
  if (dueOn < today) return waiting ? "waiting" : "overdue";
  return dueOn === today ? "today" : "future";
}

const LOOK: Record<DueState, { tone: Tone; icon: typeof Clock }> = {
  overdue: { tone: "critical", icon: CircleAlert },
  today: { tone: "warn", icon: Clock },
  future: { tone: "neutral", icon: CalendarDays },
  waiting: { tone: "neutral", icon: Hourglass },
};

/** Tone and icon of a due state, for callers that draw their own marker (dots, cells). */
export function dueLook(state: DueState) {
  return LOOK[state];
}

type Unit = Exclude<DayDistance, { when: "today" }>["unit"];
type CountKey =
  | "inDays"
  | "inWeeks"
  | "inMonths"
  | "overdueDays"
  | "overdueWeeks"
  | "overdueMonths"
  | "waitingDays"
  | "waitingWeeks"
  | "waitingMonths"
  | "compactDays"
  | "compactWeeks"
  | "compactMonths";
const KEYS: Record<"future" | "overdue" | "waiting" | "compact", Record<Unit, CountKey>> = {
  future: { day: "inDays", week: "inWeeks", month: "inMonths" },
  overdue: { day: "overdueDays", week: "overdueWeeks", month: "overdueMonths" },
  waiting: { day: "waitingDays", week: "waitingWeeks", month: "waitingMonths" },
  compact: { day: "compactDays", week: "compactWeeks", month: "compactMonths" },
};

/** The words for a due date ("Morgen", "3 Tage überfällig", …); `compact` gives "3 T" for tight cells. */
export function useDueText() {
  const t = useTranslations("due");
  return (dueOn: string, today: string, opts: { waiting?: boolean; compact?: boolean } = {}) => {
    const distance = dayDistance(dueOn, today);
    if (distance.when === "today") return t("today");
    if (opts.compact) return t(KEYS.compact[distance.unit], { count: distance.count });
    if (distance.when === "future") {
      if (distance.unit === "day" && distance.count === 1) return t("tomorrow");
      return t(KEYS.future[distance.unit], { count: distance.count });
    }
    const kind = opts.waiting ? "waiting" : "overdue";
    return t(KEYS[kind][distance.unit], { count: distance.count });
  };
}

/**
 * The due badge. Overdue, today and waiting are pills; a future date is quiet text with the calendar
 * icon. `compact` ("3 T") is for matrix cells; the full words stay in the tooltip.
 */
export function DueBadge({
  dueOn,
  today,
  waiting = false,
  compact = false,
  withDate = false,
  className,
}: {
  dueOn: string;
  today: string;
  waiting?: boolean;
  compact?: boolean;
  withDate?: boolean;
  className?: string;
}) {
  const t = useTranslations("due");
  const locale = useLocale();
  const text = useDueText();
  const state = dueState(dueOn, today, waiting);
  const { tone, icon } = LOOK[state];
  const words = text(dueOn, today, { waiting });
  // Beyond two weeks a date says more than "In 5 Wochen".
  const far = state === "future" && dueOn > addDays(today, DISTANCE_DAYS_MAX);
  const label = compact
    ? text(dueOn, today, { waiting, compact: true })
    : far
      ? formatDateShortYear(dueOn, locale, today)
      : words;
  const shown =
    withDate && !far
      ? t("withDate", { date: formatDateShortYear(dueOn, locale, today), relative: label })
      : label;
  const title = `${formatDateWithWeekday(dueOn, locale)} · ${words}`;
  if (state === "future") {
    const Icon = icon;
    return (
      <span
        title={title}
        className={cn(
          "tabular inline-flex items-center gap-1 whitespace-nowrap text-foreground-2 text-tiny",
          className,
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {shown}
      </span>
    );
  }
  return (
    <span title={title} className={cn("inline-flex", className)}>
      <StatusBadge tone={tone} icon={icon}>
        <span className="tabular">{shown}</span>
      </StatusBadge>
    </span>
  );
}
