"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell, ClipboardList, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CompanyRowActions, RowSnoozeDialog } from "@/components/notifications/company-row-actions";
import { MarkAllCompanyButton } from "@/components/notifications/mark-all-company-button";
import { useCompanyActions } from "@/components/notifications/use-company-actions";
import { DueBadge } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { MarketMarker } from "@/components/ui/market-marker";
import { cn } from "@/lib/utils";
import type { CompanyNotificationRow } from "@/server/queries/notifications";

const CENTER = "/benachrichtigungen";

/** A task opens its drawer in the center (`?aufgabe=`), a permit its own page. */
const openHrefOf = (item: CompanyNotificationRow) =>
  item.subjectType === "task" ? `${CENTER}?aufgabe=${item.subjectId}` : item.href;

/**
 * The bell for owner and manager: the number of open items as a badge (a number, not only colour; the
 * same number as the popover header and the center's "Offen") and a popover with the most urgent open
 * ones in the center's order, each with Erledigt and a "…" menu (Zurückstellen, Öffnen). `unread` only
 * decides whether "Alle als gelesen" does anything.
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
  // The date dialog of "Datum wählen …" lives outside the popover (a popover must not host a modal).
  const [pickRow, setPickRow] = useState<CompanyNotificationRow | null>(null);
  const actions = useCompanyActions();
  return (
    <>
      <Popover.Root open={isOpen} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={openCount > 0 ? t("labelOpen", { count: openCount }) : t("label")}
          className="relative grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Bell aria-hidden className="size-4" />
          {openCount > 0 && (
            <span
              aria-hidden
              className="tabular -top-0.5 -right-0.5 absolute inline-grid h-4 min-w-4 place-items-center rounded-full bg-status-critical-dot px-1 font-bold text-[10px] text-on-critical leading-none"
            >
              {openCount > 99 ? "99+" : openCount}
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
            <Popover.Popup className="flex max-h-[min(560px,calc(100svh-96px))] w-[min(420px,calc(100vw-24px))] flex-col rounded-xl border bg-popover text-popover-foreground shadow-pop outline-hidden">
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
                    const KindIcon = item.subjectType === "task" ? ClipboardList : ShieldCheck;
                    const href = openHrefOf(item);
                    const markRead = () => {
                      setOpen(false);
                      if (item.unread) actions.markRead(item.id);
                    };
                    return (
                      <li
                        key={item.id}
                        className="flex items-start gap-2 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
                      >
                        <KindIcon
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1.5">
                            {item.isKey && <KeyTaskMark label={tc("keyTask")} className="mt-1" />}
                            <Link
                              href={href as never}
                              scroll={item.subjectType !== "task"}
                              className={cn(
                                "min-w-0 break-words rounded-sm text-small hover:text-accent-soft-foreground focus-visible:outline-2 focus-visible:outline-ring",
                                item.unread ? "font-semibold" : "font-medium",
                              )}
                              onClick={markRead}
                            >
                              {item.title}
                            </Link>
                          </div>
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
                            {item.dueOn && <DueBadge dueOn={item.dueOn} today={today} withDate />}
                          </div>
                        </div>
                        <CompanyRowActions
                          row={item}
                          today={today}
                          open={{ href, onOpen: markRead }}
                          onPickDate={(row) => {
                            setOpen(false);
                            setPickRow(row);
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="border-border-subtle border-t px-4 py-2">
                <Link
                  href={CENTER as never}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-8 items-center font-medium text-accent-soft-foreground text-small hover:underline"
                >
                  {openCount > 0 ? t("viewAllCount", { count: openCount }) : t("viewAll")}
                </Link>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {pickRow && (
        <RowSnoozeDialog row={pickRow} today={today} open onClose={() => setPickRow(null)} />
      )}
    </>
  );
}
