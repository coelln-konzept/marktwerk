"use client";

import {
  type CandidateCheck,
  checkCandidates,
  endsOnFor,
  isIsoDate,
  type ScheduledEvent,
} from "@marktwerk/core";
import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { loadScheduleContext } from "@/app/(app)/veranstaltungen/actions";
import { CandidateNotes } from "@/components/events/candidate-notes";
import { formatDateRange } from "@/lib/format";

/** Existing events around a date window, for the hints (same source as "Aus Vorlage erzeugen"). */
export function useScheduleContext(from: string | null, to: string | null): ScheduledEvent[] {
  const [existing, setExisting] = useState<ScheduledEvent[]>([]);
  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    loadScheduleContext(from, to).then(
      (rows) => {
        if (!cancelled) setExisting(rows);
      },
      () => {
        if (!cancelled) setExisting([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [from, to]);
  return existing;
}

/** Hints for one new event (holidays, venue already booked, weekend cap) while the form is filled. */
export function ScheduleHints({
  venueId,
  startsOn,
  durationDays,
}: {
  venueId: string;
  startsOn: string;
  durationDays: number;
}) {
  const t = useTranslations("generate.single");
  const locale = useLocale();
  const valid =
    venueId !== "" &&
    isIsoDate(startsOn) &&
    Number.isInteger(durationDays) &&
    durationDays >= 1 &&
    durationDays <= 14;
  const endsOn = valid ? endsOnFor(startsOn, durationDays) : null;
  const existing = useScheduleContext(valid ? startsOn : null, endsOn);
  const check: CandidateCheck | undefined = useMemo(
    () =>
      valid && endsOn ? checkCandidates([{ venueId, startsOn, endsOn }], existing)[0] : undefined,
    [valid, venueId, startsOn, endsOn, existing],
  );

  return (
    <section
      aria-labelledby="schedule-hints-title"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-xl border bg-surface-2 p-4"
    >
      <h2 id="schedule-hints-title" className="flex items-center gap-2 font-semibold">
        <CalendarDays aria-hidden className="size-4" />
        {t("hints")}
      </h2>
      {check && endsOn ? (
        <>
          <p className="tabular text-foreground-2 text-small">
            {formatDateRange(check.startsOn, endsOn, locale)}
          </p>
          <CandidateNotes check={check} />
        </>
      ) : (
        <p className="text-muted-foreground text-small">{t("hintsPending")}</p>
      )}
      <p className="text-muted-foreground text-small">{t("hintsNote")}</p>
    </section>
  );
}
