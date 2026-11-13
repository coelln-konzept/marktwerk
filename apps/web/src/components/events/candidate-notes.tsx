"use client";

import type { CandidateCheck } from "@marktwerk/core";
import { CalendarClock, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { todayIn } from "@/lib/format";

/** The date lies before today: every task would be overdue the moment the event exists. */
export function isPastCandidate(c: Pick<CandidateCheck, "startsOn">): boolean {
  return c.startsOn < todayIn();
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
 * `state`: while the existing events are still loading (or loading failed) "keine Hinweise" must not
 * be shown: the venue check depends on them. No weekend hint: markets of the same weekend are planned on
 * purpose (user test 2, UT2-11).
 */
export function CandidateNotes({
  check,
  state = "ready",
}: {
  check: CandidateCheck;
  state?: "ready" | "loading" | "error";
}) {
  const t = useTranslations("generate");
  const locale = useLocale();
  const count = candidateWarningCount(check);
  return (
    <ul className="flex flex-col gap-0.5 text-small">
      {isPastCandidate(check) && (
        <li className="flex items-center gap-1 text-status-warn">
          <CalendarClock aria-hidden className="size-3.5 shrink-0" />
          {t("warn.past")}
        </li>
      )}
      {check.holidays.map((h) => (
        <li key={h.key} className="flex items-center gap-1 text-status-warn">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {t("warn.holiday", { name: locale === "en" ? h.nameEn : h.nameDe })}
        </li>
      ))}
      {check.venueConflicts.map((v) => (
        <li key={v.id} className="flex items-center gap-1 text-status-critical">
          <XCircle aria-hidden className="size-3.5 shrink-0" />
          {t("warn.venue", { name: v.name })}
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
