"use client";

import {
  addDays,
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
import type { ScheduleContextEvent } from "@/server/services/events";

export type ScheduleContextState = "idle" | "loading" | "ready" | "error";

/**
 * Existing events around a date window, for the hints (same source as "Aus Vorlage erzeugen"), with the
 * state of the request: hints must say "wird geprüft" while loading and name a failure instead of
 * claiming "keine Hinweise".
 */
export function useScheduleContextState(
  from: string | null,
  to: string | null,
): { existing: ScheduleContextEvent[]; state: ScheduleContextState; retry: () => void } {
  const [existing, setExisting] = useState<ScheduleContextEvent[]>([]);
  const [state, setState] = useState<ScheduleContextState>("idle");
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on "Erneut versuchen"
  useEffect(() => {
    if (!from || !to) {
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    loadScheduleContext(from, to).then(
      (rows) => {
        if (cancelled) return;
        setExisting(rows);
        setState("ready");
      },
      () => {
        if (cancelled) return;
        setExisting([]);
        setState("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [from, to, attempt]);
  return { existing, state, retry: () => setAttempt((n) => n + 1) };
}

/** Existing events only (agreement dates); see `useScheduleContextState` for the loading state. */
export function useScheduleContext(from: string | null, to: string | null): ScheduledEvent[] {
  return useScheduleContextState(from, to).existing;
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
  const { existing, state, retry } = useScheduleContextState(valid ? startsOn : null, endsOn);
  const check: CandidateCheck | undefined = useMemo(
    () =>
      valid && endsOn ? checkCandidates([{ venueId, startsOn, endsOn }], existing)[0] : undefined,
    [valid, venueId, startsOn, endsOn, existing],
  );
  const weekendMarkets = useMemo(() => {
    const byWeekend = new Map<string, string[]>();
    if (!check) return byWeekend;
    for (const w of check.weekendLoad) {
      byWeekend.set(
        w.saturday,
        existing
          .filter((e) => e.startsOn <= addDays(w.saturday, 1) && e.endsOn >= w.saturday)
          .map((e) => e.name),
      );
    }
    return byWeekend;
  }, [check, existing]);
  // "idle" with a valid check cannot happen (the request starts with the first render after the
  // inputs became valid); treat the instant before as loading.
  const notesState = state === "ready" ? "ready" : state === "error" ? "error" : "loading";

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
          <CandidateNotes check={check} state={notesState} weekendMarkets={weekendMarkets} />
          {state === "error" && (
            <button
              type="button"
              onClick={retry}
              className="self-start rounded-lg border border-input bg-card px-3 py-1 font-medium text-small hover:bg-hover"
            >
              {t("hintsRetry")}
            </button>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-small">{t("hintsPending")}</p>
      )}
      <p className="text-muted-foreground text-small">{t("hintsNote")}</p>
    </section>
  );
}
