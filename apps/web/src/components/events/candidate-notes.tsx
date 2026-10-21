"use client";

import type { CandidateCheck } from "@marktwerk/core";
import { Flag, TriangleAlert, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/** Number of hints for one candidate date (holidays, venue booked, overlap, weekend cap). */
export function candidateWarningCount(c: CandidateCheck): number {
  return (
    c.holidays.length +
    c.venueConflicts.length +
    (c.overlapsCandidate ? 1 : 0) +
    (c.overWeekendCap ? 1 : 0)
  );
}

/**
 * The hints shown for a date before events are created (same wording everywhere: "Aus Vorlage
 * erzeugen", "Einzeltermin", agreement dates). Hints never block; the office decides.
 */
export function CandidateNotes({ check }: { check: CandidateCheck }) {
  const t = useTranslations("generate");
  const locale = useLocale();
  return (
    <ul className="flex flex-col gap-0.5 text-small">
      {check.holidays.map((h) => (
        <li key={h.key} className="flex items-center gap-1 text-status-warn">
          <TriangleAlert aria-hidden className="size-3.5" />
          {t("warn.holiday", { name: locale === "en" ? h.nameEn : h.nameDe })}
        </li>
      ))}
      {check.overWeekendCap && (
        <li className="flex items-center gap-1 text-status-warn">
          <Flag aria-hidden className="size-3.5" />
          {t("warn.weekend", { n: Math.max(...check.weekendLoad.map((w) => w.count)) })}
        </li>
      )}
      {check.venueConflicts.map((v) => (
        <li key={v.id} className="flex items-center gap-1 text-status-critical">
          <XCircle aria-hidden className="size-3.5" />
          {t("warn.venue", { name: v.name })}
        </li>
      ))}
      {check.overlapsCandidate && (
        <li className="flex items-center gap-1 text-status-critical">
          <XCircle aria-hidden className="size-3.5" />
          {t("warn.overlap")}
        </li>
      )}
      {candidateWarningCount(check) === 0 && <li className="text-status-ok">✓ {t("warn.none")}</li>}
    </ul>
  );
}
