"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * The Kalender title as a button that opens a month/year jump: twelve months of a year (links, so the
 * choice is a URL like every other Kalender state), arrows for the year and "Heute". In Monat the month
 * becomes `monat`, in Liste the 1st of it becomes `ab`; layers and the rest of the URL are kept.
 */
export function MonthJump({
  title,
  view,
  month,
  today,
  sp,
}: {
  /** Visible title ("Dezember 2026" / the list range). */
  title: string;
  view: "monat" | "liste";
  /** Browsed month "YYYY-MM" (Monat) or the month the list starts in. */
  month: string;
  today: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const t = useTranslations("kalenderPage.jump");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const thisMonth = today.slice(0, 7);

  const href = (target: string) =>
    hrefWith("/kalender", sp, {
      ansicht: view === "liste" ? "liste" : undefined,
      monat: view === "monat" ? target : undefined,
      ab: view === "liste" ? `${target}-01` : undefined,
    });
  const monthName = (i: number) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, i, 1)),
    );
  const monthLong = (i: number) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, i, 1)),
    );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setYear(Number(month.slice(0, 4)));
      }}
    >
      <h2 className="m-0 ml-1 font-semibold text-[15px]">
        <Popover.Trigger
          aria-label={t("open", { title })}
          className="tabular inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
        >
          {title}
          <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
        </Popover.Trigger>
      </h2>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <Popover.Popup className="w-[min(288px,calc(100vw-24px))] rounded-xl border bg-popover p-3 text-popover-foreground shadow-pop outline-hidden">
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                aria-label={t("prevYear")}
                onClick={() => setYear((v) => v - 1)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <Popover.Title className="tabular m-0 flex-1 text-center font-semibold text-[15px]">
                {year}
              </Popover.Title>
              <button
                type="button"
                aria-label={t("nextYear")}
                onClick={() => setYear((v) => v + 1)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>
            <ul className="m-0 grid list-none grid-cols-3 gap-1 p-0">
              {Array.from({ length: 12 }, (_, i) => {
                const target = `${year}-${String(i + 1).padStart(2, "0")}`;
                const here = target === month;
                return (
                  <li key={target}>
                    <Link
                      href={href(target) as never}
                      scroll={false}
                      aria-label={monthLong(i)}
                      aria-current={here ? "true" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-9 items-center justify-center rounded-lg font-medium text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring",
                        here && "bg-foreground text-background hover:bg-foreground",
                        !here && target === thisMonth && "shadow-[inset_0_0_0_1px_var(--primary)]",
                      )}
                    >
                      {monthName(i)}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex justify-end border-border-subtle border-t pt-2">
              <Link
                href={hrefWith("/kalender", sp, { monat: undefined, ab: undefined }) as never}
                scroll={false}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-8 items-center rounded-lg px-3 font-medium text-accent-soft-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("today")}
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
