"use client";

import { businessDate, eventDateRange } from "@marktwerk/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createSingleEvent, undoCreateEvents } from "@/app/(app)/veranstaltungen/actions";
import {
  EventFields,
  type EventFieldsValue,
  type FieldProblem,
  fieldOfCode,
  initialFields,
  parseFields,
} from "@/components/events/event-fields";
import { ScheduleHints } from "@/components/events/schedule-hints";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { callAction, NETWORK_ERROR, SERVER_ERROR } from "@/lib/call-action";
import type { EventTypeOption } from "@/server/queries/event-form";
import type { VenueOption } from "@/server/queries/venues";

/** Problems that belong to no field: the request itself failed (UX-007). */
const REQUEST_CODES = ["offline", "server"];

/**
 * "Neue Veranstaltung ohne Vorlage" (Einzeltermin): one page because it has ~9 fields (UX concept §4).
 * Shows the generation's hints (holidays, venue booked, weekend cap) before anything is created; they
 * never block. Creates a planned event with an empty team, then opens the event page; the toast offers undo.
 *
 * A problem shows at its field and takes the focus there; after a first failed save the fields are checked
 * again on every change, so a fixed problem goes away at once. A lost connection or a server error keeps
 * everything typed and offers "Erneut versuchen".
 */
export function ManualEventForm({
  types,
  venues,
  initial,
}: {
  types: EventTypeOption[];
  venues: VenueOption[];
  initial: { venueId?: string; startsOn?: string };
}) {
  const t = useTranslations("generate.single");
  const tForm = useTranslations("events.manualForm");
  const locale = useLocale();
  const router = useRouter();
  const { showToast, showError } = useShell();
  const errorId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState<EventFieldsValue>(() => initialFields(types, locale, initial));
  const [problem, setProblem] = useState<FieldProblem | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [pending, startTransition] = useTransition();
  // The plannable years (UX-041), from today in Berlin.
  const [dateRange] = useState(() => eventDateRange(businessDate()));
  const parseOptions = { needsVenue: true, needsStart: true, dateRange };

  const errorText = (code: string) => {
    if (code === "date_out_of_range")
      return tForm("errors.date_out_of_range", {
        minYear: dateRange.minYear,
        maxYear: dateRange.maxYear,
      });
    if (REQUEST_CODES.includes(code)) return tForm(`errors.${code}` as never);
    return t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  };
  const days = Number(value.days);
  const fieldProblem = problem && problem.field !== "form" ? problem : null;

  // After a failed save the focus goes to the first marked field (its message is right below it).
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  function change(next: EventFieldsValue) {
    setValue(next);
    // Live after the first attempt: a fixed field loses its message, the next problem shows.
    if (attempted) {
      const parsed = parseFields(next, parseOptions);
      setProblem(parsed.ok ? null : parsed.problem);
    }
  }

  function fail(next: FieldProblem) {
    setAttempted(true);
    setProblem(next);
    setFocusTick((n) => n + 1);
  }

  function submit() {
    const parsed = parseFields(value, parseOptions);
    if (!parsed.ok) return fail(parsed.problem);
    setProblem(null);
    startTransition(async () => {
      // The shell's pending bar shows while it runs; a redirect (session expired) passes through.
      const result = await callAction(() => createSingleEvent(parsed.input));
      if (!result.ok && (result.error === NETWORK_ERROR || result.error === SERVER_ERROR)) {
        // Nothing typed is lost: the form stays as it is and offers "Erneut versuchen" (UX-007).
        setProblem({ field: "form", code: result.error === NETWORK_ERROR ? "offline" : "server" });
        return;
      }
      if (!result.ok) {
        fail({ field: fieldOfCode(result.error), code: result.error });
        return;
      }
      const { id, name } = result.data;
      router.push(`/veranstaltungen/${id}` as never);
      showToast({
        message: t("created", { name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoCreateEvents([id]);
          if (undone.ok && undone.data > 0) showToast({ message: t("undone") });
          else showError(t("undoTooLate"));
          if (undone.ok && undone.data > 0) router.push("/veranstaltungen" as never);
        },
      });
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex max-w-3xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="rounded-xl border bg-card p-5">
        <EventFields
          value={value}
          onChange={change}
          types={types}
          venues={venues}
          showStart
          problem={fieldProblem}
          errorId={errorId}
          messageFor={(p) => errorText(p.code)}
          dateRange={dateRange}
          validateScheduleOnLeave
        />
      </div>
      <ScheduleHints
        venueId={value.venueId}
        startsOn={value.startsOn}
        durationDays={days}
        dateRange={dateRange}
      />
      {problem?.field === "form" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-status-critical"
        >
          <p className="m-0">{errorText(problem.code)}</p>
          {REQUEST_CODES.includes(problem.code) && (
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {tForm("retry")}
            </Button>
          )}
        </div>
      )}
      <p className="text-muted-foreground text-small">{t("note")}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={"/veranstaltungen" as never}
          className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
        >
          {t("cancel")}
        </Link>
        <Button type="submit" variant="default" disabled={pending} aria-busy={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
      </div>
    </form>
  );
}
