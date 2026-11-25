"use client";

import type { CandidateCheck, Holiday } from "@marktwerk/core";
import {
  CalendarClock,
  CalendarRange,
  CopyCheck,
  Loader2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatDateRange, todayIn } from "@/lib/format";
import { quietHoursValues } from "@/lib/holidays";
import { cn } from "@/lib/utils";

/** The date lies before today: every task would be overdue the moment the event exists. */
export function isPastCandidate(c: Pick<CandidateCheck, "startsOn">): boolean {
  return c.startsOn < todayIn();
}

/**
 * One holiday hint: "Pfingstsonntag (Feiertag)", or for a stiller Feiertag "Volkstrauertag: stiller Feiertag –
 * Märkte meist nicht erlaubt (5–13 Uhr)" (FeiertG NW §6). Used wherever dates are checked before saving.
 */
export function HolidayNote({ holiday, className }: { holiday: Holiday; className?: string }) {
  const t = useTranslations("generate.warn");
  const tNotes = useTranslations("holidayNotes");
  const locale = useLocale();
  const name = locale === "en" ? holiday.nameEn : holiday.nameDe;
  return (
    <li
      className={cn(
        "flex items-start gap-1 text-status-warn",
        holiday.quiet && "font-medium",
        className,
      )}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {holiday.quiet
        ? tNotes("warnQuiet", { name, ...quietHoursValues(holiday.quiet) })
        : t("holiday", { name })}
    </li>
  );
}

/** Number of hints for one candidate date (holidays, venue booked, overlap, past). */
export function candidateWarningCount(c: CandidateCheck): number {
  return (
    c.holidays.length +
    c.venueConflicts.length +
    (c.overlapsCandidate ? 1 : 0) +
    (isPastCandidate(c) ? 1 : 0)
  );
}

/**
 * The hints shown for a date before events are created (same wording everywhere: "Aus Vorlage
 * erzeugen", "Einzeltermin", agreement dates). Hints never block; the office decides.
 *
 * Easter and Whitsun weekends get a muted line that does not count as a hint.
 *
 * `state`: while the existing events are still loading (or loading failed) "keine Hinweise" must not
 * be shown: the venue check depends on them. No weekend hint: markets of the same weekend are planned on
 * purpose (user test 2, UT2-11).
 */
export function CandidateNotes({
  check,
  state = "ready",
  sameMarket = [],
}: {
  check: CandidateCheck;
  state?: "ready" | "loading" | "error";
  /** Dates of the same market the candidate overlaps (UX-028): a warning, nothing is blocked. */
  sameMarket?: { id: string; startsOn: string; endsOn: string }[];
}) {
  const t = useTranslations("generate");
  const locale = useLocale();
  const count = candidateWarningCount(check) + sameMarket.length;
  // The other date opens in a new tab, so what was picked here stays (UX-042).
  const eventLink = (id: string) => (chunks: React.ReactNode) => (
    <a
      href={`/veranstaltungen/${id}`}
      target="_blank"
      rel="noopener"
      className="underline underline-offset-2 hover:text-foreground"
    >
      {chunks}
      <span className="sr-only"> {t("warn.newTab")}</span>
    </a>
  );
  return (
    <ul className="flex flex-col gap-0.5 text-small">
      {isPastCandidate(check) && (
        <li className="flex items-center gap-1 text-status-warn">
          <CalendarClock aria-hidden className="size-3.5 shrink-0" />
          {t("warn.past")}
        </li>
      )}
      {check.holidays.map((h) => (
        <HolidayNote key={h.key} holiday={h} />
      ))}
      {/* The quieter hint, only when no holiday of that weekend is named already (Karsamstag, Pfingstsamstag). */}
      {check.holidayWeekends
        .filter((w) => !check.holidays.some((h) => h.date >= w.from && h.date <= w.to))
        .map((w) => (
          <li key={w.key} className="flex items-center gap-1 text-muted-foreground">
            <CalendarRange aria-hidden className="size-3.5 shrink-0" />
            {locale === "en" ? w.nameEn : w.nameDe}
          </li>
        ))}
      {sameMarket.map((e) => (
        <li key={e.id} className="flex items-start gap-1 text-status-warn">
          <CopyCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t.rich("warn.sameMarket", {
              date: formatDateRange(e.startsOn, e.endsOn, locale),
              link: eventLink(e.id),
            })}
          </span>
        </li>
      ))}
      {check.venueConflicts.map((v) => (
        <li key={v.id} className="flex items-start gap-1 text-status-critical">
          <XCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t.rich("warn.venue", {
              name: v.name,
              date: formatDate(v.startsOn, locale),
              link: eventLink(v.id),
            })}
          </span>
        </li>
      ))}
      {check.overlapsCandidate && (
        <li className="flex items-center gap-1 text-status-critical">
          <XCircle aria-hidden className="size-3.5 shrink-0" />
          {t("warn.overlap")}
        </li>
      )}
      {state === "loading" && (
        <li className="flex items-center gap-1 text-muted-foreground">
          <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
          {t("warn.checking")}
        </li>
      )}
      {state === "error" && (
        <li className="flex items-center gap-1 text-status-warn">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {t("warn.unchecked")}
        </li>
      )}
      {state === "ready" && count === 0 && <li className="text-status-ok">✓ {t("warn.none")}</li>}
    </ul>
  );
}
