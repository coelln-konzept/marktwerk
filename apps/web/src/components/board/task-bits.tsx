"use client";

import { type LoadLevel, type TaskStatusKey, taskDueness } from "@marktwerk/core";
import { AlertTriangle, CalendarDays, Clock, Hourglass } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateShort, formatDateShortYear } from "@/lib/format";
import { formatHours, TASK_STATUS_UI } from "@/lib/task-ui";
import { cn } from "@/lib/utils";

/** Neutral tag with the category name (identity, never status). */
export function CategoryTag({ category }: { category: string }) {
  const t = useTranslations("tasks.categories");
  return (
    <span className="inline-flex h-5 items-center whitespace-nowrap rounded-sm bg-sunken px-1.5 font-semibold text-[11px] text-foreground-2">
      {t(category as never)}
    </span>
  );
}

/** Status badge (colour + icon + text), e.g. "Wartet" with the reason as tooltip. */
export function TaskStatusBadge({
  status,
  reason,
}: {
  status: TaskStatusKey;
  reason?: string | null;
}) {
  const t = useTranslations("tasks.status");
  const ui = TASK_STATUS_UI[status];
  return (
    <span title={reason ?? undefined}>
      <StatusBadge tone={ui.tone} icon={ui.icon}>
        {t(status)}
      </StatusBadge>
    </span>
  );
}

/**
 * Due-ness (UX concept §7): "Überfällig · 2 T" (red), "Heute" (amber), "Fällig in 3 T" or a short
 * date (neutral). Finished tasks show when they were finished instead.
 */
export function DueLine({
  dueOn,
  today,
  status,
  completedOn,
}: {
  dueOn: string | null;
  today: string;
  status: TaskStatusKey;
  completedOn?: string | null;
}) {
  const t = useTranslations("tasks.due");
  const locale = useLocale();
  if (status === "done" || status === "skipped") {
    return (
      <span className="tabular text-muted-foreground text-tiny">
        {completedOn ? t("doneOn", { date: formatDateShort(completedOn, locale) }) : t("finished")}
      </span>
    );
  }
  const d = taskDueness({ status, dueOn }, today);
  if (d.kind === "none")
    return <span className="text-faint-foreground text-tiny">{t("none")}</span>;
  if (d.kind === "waiting_since") {
    // Somebody else has to act: neutral, never the red "Überfällig".
    return (
      <StatusBadge tone="neutral" icon={Hourglass}>
        <span className="tabular">
          {t("waitingSince", { date: formatDateShortYear(d.since, locale, today) })}
        </span>
      </StatusBadge>
    );
  }
  if (d.kind === "overdue") {
    return (
      <StatusBadge tone="critical" icon={AlertTriangle}>
        <span className="tabular">{t("overdue", { days: d.days })}</span>
      </StatusBadge>
    );
  }
  if (d.kind === "today") {
    return (
      <StatusBadge tone="warn" icon={Clock}>
        {t("today")}
      </StatusBadge>
    );
  }
  return (
    <span
      className="tabular inline-flex items-center gap-1 text-foreground-2 text-tiny"
      title={formatDate(dueOn as string, locale)}
    >
      <CalendarDays aria-hidden className="size-3.5" />
      {d.kind === "soon"
        ? t("soon", { days: d.days, date: formatDateShort(dueOn as string, locale) })
        : formatDateShort(dueOn as string, locale)}
    </span>
  );
}

const FILL: Record<LoadLevel, string> = {
  ok: "bg-status-ok-dot",
  warn: "bg-status-warn-dot",
  critical: "bg-status-critical-dot",
};
const TEXT: Record<LoadLevel, string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  critical: "text-status-critical",
};

/** Load bar: colour from the status tokens plus the number ("12 / 20 h"), never colour alone. */
export function LoadBar({
  hours,
  capacity,
  level,
  label,
  className,
}: {
  hours: number;
  capacity: number;
  level: LoadLevel;
  label: string;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("board.load");
  const ratio = capacity > 0 ? Math.min(1, hours / capacity) : hours > 0 ? 1 : 0;
  const nf = new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE", {
    maximumFractionDigits: 1,
  });
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: styled bar; the figures follow as text */}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.round(hours * 10) / 10}
        aria-valuetext={`${formatHours(hours, locale)} / ${formatHours(capacity, locale)}, ${t(level)}`}
        className="h-1.5 overflow-hidden rounded-full bg-sunken"
      >
        <div
          className={cn("h-full rounded-full", FILL[level])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className={cn("tabular text-tiny", TEXT[level])}>
        {nf.format(hours)} / {formatHours(capacity, locale)}
        <span className="sr-only"> ({t(level)})</span>
      </span>
    </div>
  );
}
