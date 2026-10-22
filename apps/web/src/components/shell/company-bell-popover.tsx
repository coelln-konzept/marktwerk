"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell, CircleCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useDueInfo } from "@/components/notifications/company-row";
import { MarkAllCompanyButton } from "@/components/notifications/mark-all-company-button";
import { useCompanyActions } from "@/components/notifications/use-company-actions";
import { MarketMarker } from "@/components/ui/market-marker";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { CompanyNotificationRow } from "@/server/queries/notifications";

/**
 * The bell for owner and manager: the number of unread open items as a badge (a number, not only colour)
 * and a popover with the five most urgent open ones, each with a quick "Erledigt", plus "Alle anzeigen".
 */
export function CompanyBellPopover({
  unread,
  open: openCount,
  items,
  today,
}: {
  unread: number;
  open: number;
  items: CompanyNotificationRow[];
  today: string;
}) {
  const t = useTranslations("bell");
  const tc = useTranslations("notificationCenter");
  const [isOpen, setOpen] = useState(false);
  const actions = useCompanyActions();
  const dueInfo = useDueInfo();
  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread > 0 ? t("labelOpen", { count: unread }) : t("label")}
        className="relative grid size-8 cursor-pointer place-items-center rounded-lg outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Bell aria-hidden className="size-4" />
        {unread > 0 && (
          <span
            aria-hidden
            className="tabular -top-0.5 -right-0.5 absolute inline-grid h-4 min-w-4 place-items-center rounded-full bg-status-critical-dot px-1 font-bold text-[10px] text-white leading-none"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="flex max-h-[min(560px,calc(100svh-96px))] w-[min(420px,calc(100vw-24px))] flex-col rounded-xl border bg-popover text-popover-foreground shadow-pop outline-none">
            <div className="flex items-center justify-between gap-2 border-border-subtle border-b px-4 py-2">
              <div className="min-w-0">
                <Popover.Title className="font-semibold text-[15px]">{t("title")}</Popover.Title>
                <p className="text-muted-foreground text-tiny">
                  {t("openCount", { count: openCount })}
                </p>
              </div>
              <MarkAllCompanyButton compact disabled={unread === 0} />
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted-foreground text-small">
                {t("allClear")}
              </p>
            ) : (
              <ul className="m-0 flex-1 list-none overflow-y-auto p-0">
                {items.map((item) => {
                  const info = dueInfo(item, today);
                  const KindIcon = item.subjectType === "task" ? CircleCheck : ShieldCheck;
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-2 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
                    >
                      <KindIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground-2" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={item.href as never}
                          className={cn(
                            "block rounded-sm text-small outline-none hover:text-accent-soft-foreground focus-visible:outline-2 focus-visible:outline-ring",
                            item.unread ? "font-semibold" : "font-medium",
                          )}
                          onClick={() => {
                            setOpen(false);
                            if (item.unread) actions.markRead(item.id);
                          }}
                        >
                          {item.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-tiny">
                          {item.market && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <MarketMarker
                                color={item.market.color}
                                typeKey={item.market.typeKey}
                              />
                              <span className="truncate">{item.market.name}</span>
                            </span>
                          )}
                          {info && (
                            <StatusBadge tone={info.tone} icon={info.icon}>
                              {info.text}
                            </StatusBadge>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={actions.pending}
                        onClick={() => actions.done(item)}
                        aria-label={`${tc("actions.done")}: ${item.title}`}
                        className="inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-input bg-card px-2 text-tiny hover:bg-hover disabled:opacity-45"
                      >
                        <CircleCheck aria-hidden className="size-3.5" />
                        {tc("actions.done")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-border-subtle border-t px-4 py-2">
              <Link
                href={"/benachrichtigungen" as never}
                onClick={() => setOpen(false)}
                className="font-medium text-accent-soft-foreground text-small hover:underline"
              >
                {t("viewAll")}
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
