"use client";

import { ClipboardList, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DueBadge } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { MarketMarker } from "@/components/ui/market-marker";
import { formatDateWeekdayDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyNotificationRow } from "@/server/queries/notifications";
import { CompanyRowActions } from "./company-row-actions";
import { useCompanyActions } from "./use-company-actions";

/**
 * One row of the notification center: kind icon (a plain glyph, not a button), title (a task opens its
 * drawer in place), market with its colour marker, the due badge, and one primary action plus a "…" menu.
 * The row is the tab stop and takes part in J/K/Enter navigation (`KeyboardRows`); the title link and the
 * menu's "Öffnen" are the same target and stay out of the tab order.
 */
export function CompanyRow({
  row,
  today,
  openHref,
}: {
  row: CompanyNotificationRow;
  today: string;
  /** `?aufgabe=<id>` on this page for a task, the permit page for a permit. */
  openHref: string;
}) {
  const t = useTranslations("notificationCenter");
  const locale = useLocale();
  const router = useRouter();
  const actions = useCompanyActions();
  const isTask = row.subjectType === "task";
  const KindIcon = isTask ? ClipboardList : ShieldCheck;
  const closed = row.status === "done";
  const markRead = () => row.unread && actions.markRead(row.id);

  return (
    <li
      data-row
      data-href={openHref}
      data-peek={isTask ? openHref : undefined}
      data-task={isTask ? row.subjectId : undefined}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter (KeyboardRows)
      tabIndex={0}
      // Enter opens a task's drawer without jumping to the top of the page (KeyboardRows would scroll).
      onKeyDown={(event) => {
        if (!isTask || event.key !== "Enter" || event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        markRead();
        router.push(openHref as never, { scroll: false });
      }}
      aria-label={row.title}
      className={cn(
        "grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-border-subtle border-b px-4 py-3 last:border-b-0 hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] sm:items-center",
        row.unread && "bg-selected/40",
        closed && "text-muted-foreground",
      )}
    >
      <span
        className="mt-0.5 text-muted-foreground sm:mt-0"
        title={t(`subject.${row.subjectType}`)}
      >
        <KindIcon aria-hidden className="size-5" />
        <span className="sr-only">{t(`subject.${row.subjectType}`)}</span>
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          {/* The dot keeps its slot on read rows too, so titles line up. */}
          <span className={cn("size-2 shrink-0 rounded-full", row.unread && "bg-primary")}>
            {row.unread && <span className="sr-only">{t("unread")}</span>}
          </span>
          {row.isKey && <KeyTaskMark label={t("keyTask")} />}
          <Link
            href={openHref as never}
            scroll={!isTask}
            tabIndex={-1}
            onClick={markRead}
            className={cn(
              "min-w-0 break-words rounded-sm hover:text-accent-soft-foreground hover:underline",
              row.unread ? "font-semibold" : "font-medium",
            )}
          >
            {row.title}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-small">
          {row.market && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MarketMarker color={row.market.color} typeKey={row.market.typeKey} />
              <span className="truncate text-foreground-2">{row.market.name}</span>
            </span>
          )}
          {!isTask && <span>{t(`kind.${row.kind}`)}</span>}
          {row.status === "snoozed" && row.snoozedUntil && (
            <span className="tabular">
              {t("snoozedUntil", {
                date: formatDateWeekdayDay(row.snoozedUntil.slice(0, 10), locale),
              })}
            </span>
          )}
          {row.resolved && <span>{t("resolvedNote")}</span>}
        </div>
      </div>
      {row.status === "open" && row.dueOn && (
        <div className="col-start-2 sm:col-start-3">
          <DueBadge dueOn={row.dueOn} today={today} withDate />
        </div>
      )}
      <div className="col-start-2 sm:col-start-4">
        <CompanyRowActions row={row} today={today} open={{ href: openHref, onOpen: markRead }} />
      </div>
    </li>
  );
}
