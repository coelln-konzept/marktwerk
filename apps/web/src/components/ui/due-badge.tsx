import type { TaskStatusKey } from "@marktwerk/core";
import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DUE_UI, type DueState, dueStateOf, OVERDUE_ICON } from "@/lib/due-ui";
import { formatDate, formatDateShort, formatDateShortYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge, type Tone } from "./status-badge";

/** The text of a due state in the one vocabulary (`tasks.due`), e.g. "Überfällig · 3 Tage", "Morgen". */
export function useDueText(): (state: DueState, today: string) => string {
  const t = useTranslations("tasks.due");
  const locale = useLocale();
  return (state, today) => {
    switch (state.kind) {
      case "overdue":
        return t("overdue", { days: state.days });
      case "today":
        return t("today");
      case "tomorrow":
        return t("tomorrow");
      case "soon":
        return t("inDays", { days: state.days });
      case "later":
        return formatDateShort(state.dueOn, locale);
      case "waiting":
        return t("waitingSince", { date: formatDateShortYear(state.since, locale, today) });
      case "done":
        return state.on ? t("doneOn", { date: formatDateShort(state.on, locale) }) : t("finished");
      case "none":
        return t("none");
    }
  };
}

/**
 * Due-ness of a task or deadline (UX concept §7): a coloured badge when it needs attention (überfällig,
 * heute, wartet, erledigt), quiet text otherwise (morgen, in 3 Tagen, the date). Pass `state` directly or
 * the fields to derive it.
 */
export function DueBadge({
  dueOn = null,
  today,
  status,
  completedOn,
  state: given,
  label: givenLabel,
  className,
}: {
  dueOn?: string | null;
  today: string;
  status?: TaskStatusKey;
  completedOn?: string | null;
  state?: DueState;
  /** Another wording for the same state (e.g. "Abgelaufen · 2 Tage" for a permit); icon and colour stay. */
  label?: string;
  className?: string;
}) {
  const locale = useLocale();
  const text = useDueText();
  const state = given ?? dueStateOf({ dueOn, today, status, completedOn });
  const ui = DUE_UI[state.kind];
  const label = givenLabel ?? text(state, today);
  const title = dueOn ? formatDate(dueOn, locale) : undefined;
  if (ui.icon && (ui.tone !== "neutral" || state.kind === "done"))
    return (
      <span title={title} className={className}>
        <StatusBadge tone={ui.tone} icon={ui.icon}>
          <span className="tabular">{label}</span>
        </StatusBadge>
      </span>
    );
  const Icon = ui.icon;
  return (
    <span
      title={title}
      className={cn(
        "tabular inline-flex items-center gap-1 whitespace-nowrap text-tiny",
        state.kind === "none" ? "text-faint-foreground" : "text-foreground-2",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5" />}
      {label}
    </span>
  );
}

/** "6 überfällig": a count of overdue items, always the red octagon. */
export function OverdueCount({ count, className }: { count: number; className?: string }) {
  const t = useTranslations("tasks.due");
  return (
    <StatusBadge tone="critical" icon={OVERDUE_ICON} className={className}>
      <span className="tabular">{t("overdueCount", { count })}</span>
    </StatusBadge>
  );
}

const ICON_TONE: Record<Tone, string> = {
  critical: "text-status-critical",
  warn: "text-status-warn",
  waiting: "text-status-waiting",
  ok: "text-status-ok",
  info: "text-status-info",
  neutral: "text-muted-foreground",
};

/** Just the icon of a due state in its colour, with the text for screen readers (dense lists, legends). */
export function DueIcon({
  state,
  today,
  className,
}: {
  state: DueState;
  today: string;
  className?: string;
}) {
  const text = useDueText();
  const ui = DUE_UI[state.kind];
  const Icon = ui.icon ?? CalendarDays;
  return (
    <span
      className={cn("inline-flex shrink-0", ICON_TONE[ui.tone], className)}
      title={text(state, today)}
    >
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">{text(state, today)}</span>
    </span>
  );
}
