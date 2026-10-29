"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { skipPastMarkets, undoPastMarketCleanup } from "@/app/(app)/overview-actions";
import { useShell } from "@/components/shell/shell-context";
import { MarketMarker } from "@/components/ui/market-marker";
import { formatDateRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PastEventCleanupRow } from "@/server/queries/tasks";

/**
 * The cleanup view: past markets with their open task counts, newest first. "Überspringen" skips that
 * market's open tasks, "Alle überspringen" all of them; each is one transaction and answered by an undo
 * toast that restores the previous statuses (no confirmation dialog, UX concept §6).
 */
export function CleanupList({ events }: { events: PastEventCleanupRow[] }) {
  const t = useTranslations("overview.cleanup");
  const locale = useLocale();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function skip(eventIds?: string[]) {
    startTransition(async () => {
      const result = await skipPastMarkets(eventIds);
      if (!result.ok) {
        showToast({ message: t("error") });
        return;
      }
      const { skipped, auditIds } = result.data;
      if (skipped === 0) {
        showToast({ message: t("nothingToSkip") });
        return;
      }
      showToast({
        message: t("skipped", { count: skipped }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoPastMarketCleanup(auditIds);
          showToast({ message: undone.ok ? t("reverted") : t("undoFailed") });
        },
      });
    });
  }

  if (events.length === 0) {
    return <p className="m-0 text-muted-foreground">{t("empty")}</p>;
  }
  const total = events.reduce((sum, e) => sum + e.openTasks, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-muted-foreground text-small">
          {t("summary", { tasks: total, markets: events.length })}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => skip()}
          className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60"
        >
          {t("skipAll")}
        </button>
      </div>
      <ul className={cn("m-0 flex list-none flex-col p-0", pending && "opacity-70")}>
        {events.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border-subtle border-b py-2.5 first:border-t"
          >
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <MarketMarker color={e.color} typeKey={e.typeKey} />
                <Link
                  href={`/veranstaltungen/${e.id}` as never}
                  className="min-w-0 break-words font-semibold hover:underline"
                >
                  {e.name}
                </Link>
              </span>
              <span className="tabular block text-muted-foreground text-small">
                {formatDateRange(e.startsOn, e.endsOn, locale)} ·{" "}
                {t("open", { count: e.openTasks })}
              </span>
            </div>
            <button
              type="button"
              disabled={pending}
              aria-label={t("skipOne", { name: e.name })}
              onClick={() => skip([e.id])}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 font-medium hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60"
            >
              <CircleCheck aria-hidden className="size-4 text-foreground-2" />
              {t("skip")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
