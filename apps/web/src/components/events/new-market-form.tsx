"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { createMarketAction } from "@/app/(app)/veranstaltungen/actions";
import {
  EventFields,
  type EventFieldsValue,
  type FieldProblem,
  fieldOfCode,
  initialFields,
  parseFields,
} from "@/components/events/event-fields";
import { NO_RHYTHM, type Rhythm, rhythmToRule } from "@/components/presets/rhythm";
import { RhythmBuilder } from "@/components/presets/rhythm-builder";
import { Button } from "@/components/ui/button";
import { OptionalMark } from "@/components/ui/label";
import type { EventTypeOption } from "@/server/queries/event-form";
import type { GenerationPreset } from "@/server/queries/presets";
import type { VenueOption } from "@/server/queries/venues";

/**
 * "Neuen Markt anlegen": the compact form inside "Markt planen" (name, type, venue, default times,
 * prices, rhythm optional). Creates the market through `createMarket` (own task template copied from the
 * master) and hands it to the sheet, which continues with choosing dates.
 */
export function NewMarketForm({
  types,
  venues,
  initialName,
  onCreated,
  onCancel,
}: {
  types: EventTypeOption[];
  venues: VenueOption[];
  initialName: string;
  onCreated: (market: GenerationPreset, template: { items: number } | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("generate.market");
  const tSingle = useTranslations("generate.single");
  const locale = useLocale();
  const errorId = useId();
  const [value, setValue] = useState<EventFieldsValue>(() => ({
    ...initialFields(types, locale),
    name: initialName,
  }));
  const [rhythm, setRhythm] = useState<Rhythm>(NO_RHYTHM);
  const [problem, setProblem] = useState<FieldProblem | null>(null);
  const [pending, startTransition] = useTransition();

  const message = (code: string) =>
    t.has(`errors.${code}` as never)
      ? t(`errors.${code}` as never)
      : tSingle.has(`errors.${code}` as never)
        ? tSingle(`errors.${code}` as never)
        : tSingle("errors.generic");

  function submit() {
    const parsed = parseFields(value, { needsVenue: true, needsStart: false });
    if (!parsed.ok) return setProblem(parsed.problem);
    const rrule = rhythmToRule(rhythm, null);
    if (rrule === undefined) return setProblem({ field: "rrule", code: "invalid_rrule" });
    const input = parsed.input;
    setValue((v) => ({ ...v, times: input.times }));
    setProblem(null);
    startTransition(async () => {
      const result = await createMarketAction({
        name: input.name,
        eventTypeId: input.eventTypeId,
        venueId: input.venueId,
        durationDays: input.durationDays,
        times: input.times,
        pricePerMCents: input.pricePerMCents,
        bookingFeeCents: input.bookingFeeCents,
        rrule,
      });
      if (!result.ok) {
        setProblem({
          field: result.error === "invalid_fee" ? "fee" : fieldOfCode(result.error),
          code: result.error,
        });
        return;
      }
      const type = types.find((x) => x.id === input.eventTypeId);
      const place = venues.find((x) => x.id === input.venueId);
      onCreated(
        {
          id: result.data.id,
          name: input.name,
          typeKey: type?.key ?? "",
          typeNameDe: type?.nameDe ?? "",
          typeNameEn: type?.nameEn ?? "",
          venueId: input.venueId,
          venueName: place?.name ?? "",
          durationDays: input.durationDays,
          rrule,
          pricePerMCents: input.pricePerMCents,
          color: result.data.color,
          lastHeldOn: null,
          plannedBySeason: {},
        },
        result.data.template,
      );
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      aria-labelledby="new-market-title"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <h3 id="new-market-title" className="font-semibold">
          {t("title")}
        </h3>
        <p className="mt-1 text-muted-foreground text-small">{t("hint")}</p>
      </div>
      <EventFields
        value={value}
        onChange={setValue}
        types={types}
        venues={venues}
        showStart={false}
        problem={problem}
        errorId={errorId}
        idPrefix="nm"
      />
      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer font-medium">
          {t("rhythm")} <OptionalMark />
        </summary>
        <div className="pt-3">
          <RhythmBuilder
            rhythm={rhythm}
            onChange={setRhythm}
            storedRule={null}
            durationDays={Number(value.days)}
            error={problem?.field === "rrule" ? message(problem.code) : undefined}
          />
        </div>
      </details>
      {problem && problem.field !== "rrule" && (
        <p id={errorId} role="alert" className="text-small text-status-critical">
          {message(problem.code)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="default" disabled={pending} aria-busy={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
      </div>
    </form>
  );
}
