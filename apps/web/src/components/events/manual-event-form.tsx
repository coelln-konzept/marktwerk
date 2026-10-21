"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
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
import type { EventTypeOption } from "@/server/queries/event-form";
import type { VenueOption } from "@/server/queries/venues";

/**
 * "Neue Veranstaltung ohne Vorlage" (Einzeltermin): one page because it has ~9 fields (UX concept §4).
 * Shows the generation's hints (holidays, venue booked, weekend cap) before anything is created; they
 * never block. Creates a draft with an empty team, then opens the event page; the toast offers undo.
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
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const errorId = useId();
  const [value, setValue] = useState<EventFieldsValue>(() => initialFields(types, locale, initial));
  const [problem, setProblem] = useState<FieldProblem | null>(null);
  const [pending, startTransition] = useTransition();

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const days = Number(value.days);

  function submit() {
    const parsed = parseFields(value, { needsVenue: true, needsStart: true });
    if (!parsed.ok) return setProblem(parsed.problem);
    setValue((v) => ({ ...v, times: parsed.input.times }));
    setProblem(null);
    startTransition(async () => {
      const result = await createSingleEvent(parsed.input);
      if (!result.ok) {
        setProblem({ field: fieldOfCode(result.error), code: result.error });
        return;
      }
      const { id, name } = result.data;
      router.push(`/veranstaltungen/${id}` as never);
      showToast({
        message: t("created", { name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoCreateEvents([id]);
          showToast({
            message: undone.ok && undone.data > 0 ? t("undone") : t("undoTooLate"),
          });
          if (undone.ok && undone.data > 0) router.push("/veranstaltungen" as never);
        },
      });
    });
  }

  return (
    <form
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
          onChange={setValue}
          types={types}
          venues={venues}
          showStart
          problem={problem}
          errorId={errorId}
        />
      </div>
      <ScheduleHints venueId={value.venueId} startsOn={value.startsOn} durationDays={days} />
      {problem && (
        <p id={errorId} role="alert" className="text-small text-status-critical">
          {errorText(problem.code)}
        </p>
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
