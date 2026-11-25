"use client";

import { Popover } from "@base-ui/react/popover";
import {
  CALENDAR_YEAR_MAX,
  CALENDAR_YEAR_MIN,
  inCalendarRange,
  parseCalendarJump,
} from "@marktwerk/core";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * The Kalender title as a button that opens a month/year jump: a field for a typed date or month
 * ("14.3.2027", "3.2027", "März 2027", UX-051), twelve months of a year (links, so the choice is a URL like
 * every other Kalender state), arrows for the year (they stop at the Kalender's range, UX-041) and "Heute".
 * In Monat the month becomes `monat`; in Liste the typed day, or the 1st of the month, becomes `ab`.
 * Layers and the rest of the URL are kept.
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
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<"invalid" | "range" | null>(null);
  const thisMonth = today.slice(0, 7);

  const href = (target: string, day?: string | null) =>
    hrefWith("/kalender", sp, {
      ansicht: view === "liste" ? "liste" : undefined,
      monat: view === "monat" ? target : undefined,
      ab: view === "liste" ? (day ?? `${target}-01`) : undefined,
    });

  function jump(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseCalendarJump(typed, today);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push(href(result.month, result.date) as never, { scroll: false });
  }
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
        if (next) {
          setYear(Number(month.slice(0, 4)));
          setTyped("");
          setError(null);
        }
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
            <form onSubmit={jump} noValidate className="mb-3 flex flex-col gap-1">
              <label htmlFor={`${uid}-jump`} className="font-medium text-small">
                {t("typed")}
              </label>
              <div className="flex gap-1.5">
                <input
                  id={`${uid}-jump`}
                  value={typed}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    setError(null);
                  }}
                  placeholder={t("typedPlaceholder")}
                  autoComplete="off"
                  enterKeyHint="go"
                  aria-invalid={error !== null || undefined}
                  aria-describedby={error ? `${uid}-error` : undefined}
                  className="min-h-(--control-h) min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-1 text-small aria-invalid:border-status-critical"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-(--control-h) cursor-pointer items-center rounded-lg border border-input bg-card px-3 font-medium text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {t("go")}
                </button>
              </div>
              {error && (
                <p id={`${uid}-error`} className="m-0 text-status-critical text-tiny">
                  {error === "range"
                    ? t("errorRange", { min: CALENDAR_YEAR_MIN, max: CALENDAR_YEAR_MAX })
                    : t("errorInvalid")}
                </p>
              )}
            </form>
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                aria-label={t("prevYear")}
                disabled={!inCalendarRange(year - 1)}
                onClick={() => setYear((v) => v - 1)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <Popover.Title className="tabular m-0 flex-1 text-center font-semibold text-[15px]">
                {year}
              </Popover.Title>
              <button
                type="button"
                aria-label={t("nextYear")}
                disabled={!inCalendarRange(year + 1)}
                onClick={() => setYear((v) => v + 1)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
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
