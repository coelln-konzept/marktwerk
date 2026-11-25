"use client";

import type { MarketColor } from "@marktwerk/core";
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
import { MarketColorPicker } from "@/components/ui/market-color-picker";
import type { EventTypeOption } from "@/server/queries/event-form";
import type { GenerationPreset } from "@/server/queries/presets";
import type { VenueOption } from "@/server/queries/venues";

/**
 * "Neuen Markt anlegen": the compact form inside "Markt planen" (name, type, venue, Zeitplan,
 * prices, rhythm optional). Creates the market through `createMarket` (own task template copied from the
 * master) and hands it to the sheet, which continues with choosing dates.
 */
export function NewMarketForm({
  types,
  venues,
  colorUsage,
  suggestedColor,
  initialName,
  initialValue,
  fromEventId,
  title,
  hint,
  onCreated,
  onCancel,
}: {
  types: EventTypeOption[];
  venues: VenueOption[];
  /** Colour key → names of the active markets using it (legend). */
  colorUsage: Record<string, string[]>;
  /** Pre-selected: the colour a market gets when none is chosen (the least used one). */
  suggestedColor: MarketColor;
  initialName: string;
  /** Prefilled fields (Archiv: "Als Vorlage speichern" from a past event). */
  initialValue?: EventFieldsValue;
  /** The past event the market is made from; its market's tasks are copied instead of the master. */
  fromEventId?: string;
  /** Heading override; null leaves it out (the dialog around the form has its own title). */
  title?: string | null;
  hint?: string;
  onCreated: (market: GenerationPreset, template: { items: number } | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("generate.market");
  const tSingle = useTranslations("generate.single");
  const locale = useLocale();
  const errorId = useId();
  const [value, setValue] = useState<EventFieldsValue>(
    () => initialValue ?? { ...initialFields(types, locale), name: initialName },
  );
  const [rhythm, setRhythm] = useState<Rhythm>(NO_RHYTHM);
  const [color, setColor] = useState<string | null>(suggestedColor);
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
    setProblem(null);
    startTransition(async () => {
      const result = await createMarketAction(
        {
          name: input.name,
          eventTypeId: input.eventTypeId,
          venueId: input.venueId,
          durationDays: input.durationDays,
          schedule: input.schedule,
          pricePerMCents: input.pricePerMCents,
          bookingFeeCents: input.bookingFeeCents,
          rrule,
          color,
        },
        fromEventId,
      );
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
          pastDates: [],
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
      {title === null ? (
        <p id="new-market-title" className="text-muted-foreground text-small">
          {hint ?? t("hint")}
        </p>
      ) : (
        <div>
          <h3 id="new-market-title" className="font-semibold">
            {title ?? t("title")}
          </h3>
          <p className="mt-1 text-muted-foreground text-small">{hint ?? t("hint")}</p>
        </div>
      )}
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
      <MarketColorPicker
        name="new-market-color"
        value={color}
        onChange={setColor}
        usage={colorUsage}
      />
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
