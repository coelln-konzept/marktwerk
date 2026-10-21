"use client";

import { addDays, type CandidateCheck, checkCandidates, endsOnFor, isoWeek } from "@marktwerk/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import { generateFromAgreement } from "@/app/(app)/orte/[id]/vereinbarungen/actions";
import { undoCreateEvents } from "@/app/(app)/veranstaltungen/actions";
import { CandidateNotes } from "@/components/events/candidate-notes";
import {
  EventFields,
  type EventFieldsValue,
  type FieldProblem,
  fieldOfCode,
  initialFields,
  parseFields,
} from "@/components/events/event-fields";
import { useScheduleContext } from "@/components/events/schedule-hints";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { formatDateWithWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventTypeOption } from "@/server/queries/event-form";
import type { GenerationPreset } from "@/server/queries/presets";

const MANUAL = "manual";

/**
 * "Termine erzeugen" for a location agreement: choose what the events are copied from (an active preset
 * of the venue, or typed event data), tick the dates that have no event yet, see the same hints as
 * "Aus Vorlage erzeugen", create. One page because the typed-data variant has more than 8 fields.
 */
export function AgreementGenerateForm({
  agreementId,
  venueId,
  venueName,
  pending: pendingDates,
  presets,
  types,
}: {
  agreementId: string;
  venueId: string;
  venueName: string;
  /** Fixed dates without an event. */
  pending: string[];
  /** Active presets of this venue. */
  presets: GenerationPreset[];
  types: EventTypeOption[];
}) {
  const t = useTranslations("agreements.generateForm");
  const tSingle = useTranslations("generate.single");
  const tGen = useTranslations("generate");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const errorId = useId();
  const [source, setSource] = useState<string>(presets[0]?.id ?? MANUAL);
  const [fields, setFields] = useState<EventFieldsValue>(() =>
    initialFields(types, locale, { venueId }),
  );
  const [selected, setSelected] = useState<string[]>(pendingDates);
  const [problem, setProblem] = useState<FieldProblem | null>(null);
  const [pending, startTransition] = useTransition();

  const preset = presets.find((p) => p.id === source);
  const typedDays = Number(fields.days);
  const durationDays = preset
    ? preset.durationDays
    : Number.isInteger(typedDays) && typedDays >= 1 && typedDays <= 14
      ? typedDays
      : 1;

  const first = pendingDates[0] ?? null;
  const last = pendingDates.at(-1) ?? null;
  const existing = useScheduleContext(first, last ? endsOnFor(last, durationDays) : null);
  const checks = useMemo(() => {
    const byDate = new Map<string, CandidateCheck>();
    for (const c of checkCandidates(
      selected.map((d) => ({ venueId, startsOn: d, endsOn: endsOnFor(d, durationDays) })),
      existing,
    ))
      byDate.set(c.startsOn, c);
    return byDate;
  }, [selected, existing, venueId, durationDays]);

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : tSingle.has(`errors.${code}` as never)
        ? tSingle(`errors.${code}` as never)
        : tGen.has(`errors.${code}` as never)
          ? tGen(`errors.${code}` as never)
          : tSingle("errors.generic");

  function toggle(date: string) {
    setSelected((current) =>
      current.includes(date) ? current.filter((d) => d !== date) : [...current, date].sort(),
    );
  }

  function submit() {
    setProblem(null);
    let plan: Parameters<typeof generateFromAgreement>[1];
    if (preset) {
      plan = { presetId: preset.id };
    } else {
      const parsed = parseFields(fields, { needsVenue: false, needsStart: false });
      if (!parsed.ok) return setProblem(parsed.problem);
      setFields((v) => ({ ...v, times: parsed.input.times }));
      const { venueId: _venue, startsOn: _start, ...manual } = parsed.input;
      plan = { manual };
    }
    if (selected.length === 0) return setProblem({ field: "form", code: "no_dates" });
    startTransition(async () => {
      const result = await generateFromAgreement(agreementId, plan, selected);
      if (!result.ok) {
        setProblem({ field: fieldOfCode(result.error), code: result.error });
        return;
      }
      const { ids } = result.data;
      router.push(`/orte/${venueId}` as never);
      showToast({
        message: tGen("created", { count: ids.length }),
        actionLabel: tGen("undo"),
        onAction: async () => {
          await undoCreateEvents(ids);
        },
      });
    });
  }

  if (pendingDates.length === 0) {
    return (
      <div className="flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-5">
        <p>{t("allDone")}</p>
        <Link
          href={`/orte/${venueId}` as never}
          className="font-medium text-accent-soft-foreground hover:underline"
        >
          {t("back", { venue: venueName })}
        </Link>
      </div>
    );
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
      <fieldset className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <legend className="px-1 font-semibold">{t("source")}</legend>
        {presets.map((p) => (
          <label
            key={p.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-hover",
              source === p.id && "border-primary bg-selected",
            )}
          >
            <input
              type="radio"
              name="source"
              value={p.id}
              checked={source === p.id}
              onChange={() => setSource(p.id)}
              className="size-4 accent-(--primary)"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{p.name}</span>
              <span className="block truncate text-muted-foreground text-small">
                {t("presetFacts", { days: p.durationDays })}
              </span>
            </span>
            <EventTypeTag typeKey={p.typeKey}>
              {locale === "en" ? p.typeNameEn : p.typeNameDe}
            </EventTypeTag>
          </label>
        ))}
        {presets.length === 0 && (
          <p className="text-muted-foreground text-small">{t("noPresets", { venue: venueName })}</p>
        )}
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-hover",
            source === MANUAL && "border-primary bg-selected",
          )}
        >
          <input
            type="radio"
            name="source"
            value={MANUAL}
            checked={source === MANUAL}
            onChange={() => setSource(MANUAL)}
            className="size-4 accent-(--primary)"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("manual")}</span>
            <span className="block text-muted-foreground text-small">{t("manualHint")}</span>
          </span>
        </label>
        {source === MANUAL && (
          <div className="mt-3">
            <EventFields
              value={fields}
              onChange={setFields}
              types={types}
              showStart={false}
              problem={problem}
              errorId={errorId}
              idPrefix="ag"
            />
          </div>
        )}
      </fieldset>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">{t("dates")}</h2>
        <p className="text-muted-foreground text-small">
          {t("datesIntro", { venue: venueName, count: pendingDates.length })}
        </p>
        <ul className="m-0 flex list-none flex-col p-0">
          {pendingDates.map((date) => {
            const check = checks.get(date);
            const on = selected.includes(date);
            const inputId = `date-${date}`;
            return (
              <li
                key={date}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-border-subtle border-b py-2 last:border-b-0 sm:grid-cols-[auto_12rem_3rem_minmax(0,1fr)]"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(date)}
                  className="mt-1 size-4 accent-(--primary)"
                />
                <label htmlFor={inputId} className="tabular cursor-pointer font-semibold">
                  {formatDateWithWeekday(date, locale)}
                  {durationDays > 1 &&
                    ` – ${formatDateWithWeekday(addDays(date, durationDays - 1), locale)}`}
                </label>
                <span className="tabular text-muted-foreground max-sm:hidden">
                  {tGen("weekShort")} {isoWeek(date).week}
                </span>
                <div className="col-start-2 sm:col-start-auto">
                  {on && check ? (
                    <CandidateNotes check={check} />
                  ) : (
                    <span className="text-muted-foreground text-small">
                      {on ? t("checking") : t("skipped")}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-small">{tGen("previewNote")}</p>
      </section>

      {problem && (
        <p id={errorId} role="alert" className="text-small text-status-critical">
          {errorText(problem.code)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={`/orte/${venueId}` as never}
          className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
        >
          {t("cancel")}
        </Link>
        <Button
          type="submit"
          variant="default"
          disabled={pending || selected.length === 0}
          aria-busy={pending}
        >
          {pending ? tGen("creating") : tGen("create", { count: selected.length })}
        </Button>
      </div>
    </form>
  );
}
