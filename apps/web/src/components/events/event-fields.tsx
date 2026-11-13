"use client";

import { defaultSchedule, isIsoDate, parseEuroCents, type ScheduleRow } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import {
  fromScheduleDraft,
  type ScheduleDraftRow,
  ScheduleEditor,
  scheduleDraftIssues,
  toScheduleDraft,
} from "@/components/schedule/schedule-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VenuePicker } from "@/components/venues/venue-picker";
import type { EventTypeOption } from "@/server/queries/event-form";
import type { VenueOption } from "@/server/queries/venues";

export const MAX_EVENT_DAYS = 14;

export type EventFieldsValue = {
  name: string;
  eventTypeId: string;
  venueId: string;
  /** First day, YYYY-MM-DD (empty while not chosen). */
  startsOn: string;
  days: string;
  /** The Zeitplan as edited (ADR 0022); a new market or single event starts with the default rows. */
  schedule: ScheduleDraftRow[];
  price: string;
  fee: string;
  /** Prices stop following the event type once the office typed one. */
  priceTouched: boolean;
  feeTouched: boolean;
};

/** 1250 → "12,50" (de) / "12.50" (en), the way it's typed back in. */
export function centsToInput(cents: number, locale: string) {
  const text = (cents / 100).toFixed(2);
  return locale === "en" ? text : text.replace(".", ",");
}

function typeDefaults(type: EventTypeOption | undefined, locale: string) {
  return {
    price:
      type?.defaultPricePerMCents != null ? centsToInput(type.defaultPricePerMCents, locale) : "",
    fee:
      type?.defaultBookingFeeCents != null ? centsToInput(type.defaultBookingFeeCents, locale) : "",
  };
}

export function initialFields(
  types: EventTypeOption[],
  locale: string,
  preset: { venueId?: string; startsOn?: string } = {},
): EventFieldsValue {
  const type = types[0];
  return {
    name: "",
    eventTypeId: type?.id ?? "",
    venueId: preset.venueId ?? "",
    startsOn: preset.startsOn ?? "",
    days: "1",
    schedule: toScheduleDraft(defaultSchedule()),
    ...typeDefaults(type, locale),
    priceTouched: false,
    feeTouched: false,
  };
}

/** Choosing another event type re-fills the prices from its rules unless they were typed by hand. */
export function withEventType(
  value: EventFieldsValue,
  eventTypeId: string,
  types: EventTypeOption[],
  locale: string,
): EventFieldsValue {
  const defaults = typeDefaults(
    types.find((t) => t.id === eventTypeId),
    locale,
  );
  return {
    ...value,
    eventTypeId,
    price: value.priceTouched ? value.price : defaults.price,
    fee: value.feeTouched ? value.fee : defaults.fee,
  };
}

export type FieldProblem = { field: string; code: string };

/** Which input a service/validation error belongs to. */
export function fieldOfCode(code: string): string {
  switch (code) {
    case "invalid_name":
      return "name";
    case "invalid_event_type":
      return "type";
    case "invalid_venue":
      return "venue";
    case "invalid_date":
    case "no_dates":
      return "start";
    case "invalid_duration":
      return "days";
    case "invalid_schedule":
      return "schedule";
    case "invalid_price":
      return "price";
    default:
      return "form";
  }
}

export type ParsedFields = {
  name: string;
  eventTypeId: string;
  venueId: string;
  startsOn: string;
  durationDays: number;
  schedule: ScheduleRow[];
  pricePerMCents: number;
  bookingFeeCents: number;
};

/**
 * Client-side check of the typed values (the service checks again); the Zeitplan comes back with its
 * times normalised. A Zeitplan issue is `invalid_schedule` on the field "schedule"; the editor shows
 * which rows.
 */
export function parseFields(
  value: EventFieldsValue,
  options: { needsVenue: boolean; needsStart: boolean },
): { ok: true; input: ParsedFields } | { ok: false; problem: FieldProblem } {
  const fail = (field: string, code: string) => ({ ok: false as const, problem: { field, code } });
  const name = value.name.trim();
  if (name === "") return fail("name", "invalid_name");
  if (!value.eventTypeId) return fail("type", "invalid_event_type");
  if (options.needsVenue && !value.venueId) return fail("venue", "invalid_venue");
  if (options.needsStart && !isIsoDate(value.startsOn)) return fail("start", "invalid_date");
  const durationDays = Number(value.days);
  if (!/^\d{1,2}$/.test(value.days.trim()) || durationDays < 1 || durationDays > MAX_EVENT_DAYS)
    return fail("days", "invalid_duration");
  if (scheduleDraftIssues(value.schedule, durationDays).length > 0)
    return fail("schedule", "invalid_schedule");
  const pricePerMCents = parseEuroCents(value.price);
  if (pricePerMCents === null) return fail("price", "invalid_price");
  const bookingFeeCents = parseEuroCents(value.fee);
  if (bookingFeeCents === null) return fail("fee", "invalid_price");
  return {
    ok: true,
    input: {
      name,
      eventTypeId: value.eventTypeId,
      venueId: value.venueId,
      startsOn: value.startsOn,
      durationDays,
      schedule: fromScheduleDraft(value.schedule),
      pricePerMCents,
      bookingFeeCents,
    },
  };
}

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 aria-invalid:border-destructive";

/**
 * The fields of a single event: name, type, venue (optional), first day (optional), number of days,
 * the Zeitplan (rows with 24-hour text times, like "Eckdaten bearbeiten") and the prices. Controlled; the parent
 * owns the value and the problem to show.
 */
export function EventFields({
  value,
  onChange,
  types,
  venues,
  showStart,
  problem,
  errorId,
  idPrefix = "ef",
  canCreateVenue = true,
}: {
  value: EventFieldsValue;
  onChange: (next: EventFieldsValue) => void;
  types: EventTypeOption[];
  /** Venue select; omit when the venue is fixed (agreement dates). */
  venues?: VenueOption[];
  showStart: boolean;
  problem: FieldProblem | null;
  errorId: string;
  idPrefix?: string;
  /**
   * "+ Neu" in the Ort picker (UT2-01). On by default: these forms need event:write (owner, manager), who
   * may write venues too.
   */
  canCreateVenue?: boolean;
}) {
  const t = useTranslations("generate.single");
  const locale = useLocale();
  const set = (patch: Partial<EventFieldsValue>) => onChange({ ...value, ...patch });
  const invalid = (field: string) =>
    problem?.field === field ? { "aria-invalid": true as const, "aria-describedby": errorId } : {};
  const id = (field: string) => `${idPrefix}-${field}`;
  const showScheduleErrors = problem?.field === "schedule";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={id("name")}>{t("name")}</Label>
          <Input
            id={id("name")}
            autoComplete="off"
            maxLength={120}
            required
            value={value.name}
            onChange={(e) => set({ name: e.target.value })}
            {...invalid("name")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("type")}>{t("type")}</Label>
          <select
            id={id("type")}
            value={value.eventTypeId}
            onChange={(e) => onChange(withEventType(value, e.target.value, types, locale))}
            className={SELECT_CLASS}
            {...invalid("type")}
          >
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {locale === "en" ? type.nameEn : type.nameDe}
              </option>
            ))}
          </select>
        </div>
        {venues && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("venue")}>{t("venue")}</Label>
            <VenuePicker
              id={id("venue")}
              venues={venues}
              value={value.venueId}
              onChange={(venueId) => set({ venueId })}
              canCreate={canCreateVenue}
              placeholder={t("venuePlaceholder")}
              invalid={problem?.field === "venue"}
              describedBy={problem?.field === "venue" ? errorId : undefined}
            />
          </div>
        )}
        {showStart && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("start")}>{t("start")}</Label>
            <Input
              id={id("start")}
              type="date"
              required
              value={value.startsOn}
              onChange={(e) => set({ startsOn: e.target.value })}
              className="tabular"
              {...invalid("start")}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("days")}>{t("days")}</Label>
          <Input
            id={id("days")}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_EVENT_DAYS}
            required
            value={value.days}
            onChange={(e) => set({ days: e.target.value })}
            className="tabular"
            {...invalid("days")}
          />
        </div>
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-2 p-0 font-medium text-small">{t("schedule")}</legend>
        <ScheduleEditor
          value={value.schedule}
          onChange={(schedule) => set({ schedule })}
          durationDays={Number(value.days)}
          showErrors={showScheduleErrors}
          idPrefix={id("schedule")}
        />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("price")}>{t("price")}</Label>
          <div className="relative">
            <Input
              id={id("price")}
              inputMode="decimal"
              autoComplete="off"
              value={value.price}
              onChange={(e) => set({ price: e.target.value, priceTouched: true })}
              className="tabular pr-14"
              {...invalid("price")}
            />
            <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
              {t("perMeter")}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("fee")}>{t("fee")}</Label>
          <div className="relative">
            <Input
              id={id("fee")}
              inputMode="decimal"
              autoComplete="off"
              value={value.fee}
              onChange={(e) => set({ fee: e.target.value, feeTouched: true })}
              className="tabular pr-8"
              {...invalid("fee")}
            />
            <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
              €
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
