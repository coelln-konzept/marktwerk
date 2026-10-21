"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  addDays,
  type CandidateCheck,
  checkCandidates,
  daysInMonth,
  endsOnFor,
  expandRRule,
  holidaysBetween,
  isoDate,
  isoWeek,
  mondayOf,
  parseRRule,
  type ScheduledEvent,
  weekday,
  weekendsTouched,
} from "@marktwerk/core";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createEvents,
  loadScheduleContext,
  undoCreateEvents,
} from "@/app/(app)/veranstaltungen/actions";
import { CandidateNotes, candidateWarningCount } from "@/components/events/candidate-notes";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Kbd } from "@/components/ui/kbd";
import { formatDateWithWeekday, formatMonth, formatWeek, todayIn } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GenerationPreset } from "@/server/queries/presets";

const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const POSITIONS = [1, 2, 3, 4, -1] as const;

function monthKey(date: string) {
  return date.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Rule fields prefilled from the preset's recurrence rule. */
function ruleFromPreset(rrule: string | null, year: number) {
  const fallback = { setPos: 1, day: 0, fromMonth: 4, toMonth: 10, year };
  if (!rrule) return fallback;
  try {
    const parsed = parseRRule(rrule);
    const months = parsed.months ?? [1, 12];
    return {
      setPos: parsed.setPos ?? 1,
      day: parsed.weekdays[0] ?? 0,
      fromMonth: Math.min(...months),
      toMonth: Math.max(...months),
      year,
    };
  } catch {
    return fallback;
  }
}

/**
 * "Aus Vorlage erzeugen" (UX concept, wireframe W5): 3 steps in a side sheet: (1) preset, (2) dates in a
 * 3-month calendar or by rule, with NRW holidays and conflict markers, (3) preview with warnings, then
 * one call to the `createEventsFromPreset` service. Warnings never block; the office decides.
 */
export function GenerateSheet({
  presets,
  initialPresetId,
  closeHref,
}: {
  presets: GenerationPreset[];
  initialPresetId?: string;
  closeHref: string;
}) {
  const t = useTranslations("generate");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const today = todayIn();
  const nextYear = Number(today.slice(0, 4)) + 1;

  const [step, setStep] = useState<1 | 2 | 3>(initialPresetId ? 2 : 1);
  const [presetId, setPresetId] = useState(
    presets.some((p) => p.id === initialPresetId)
      ? (initialPresetId as string)
      : (presets[0]?.id ?? ""),
  );
  const preset = presets.find((p) => p.id === presetId);
  const [mode, setMode] = useState<"click" | "rule">("rule");
  const [rule, setRule] = useState(() => ruleFromPreset(preset?.rrule ?? null, nextYear));
  const [firstMonth, setFirstMonth] = useState(
    `${nextYear}-${String(rule.fromMonth).padStart(2, "0")}`,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [existing, setExisting] = useState<ScheduledEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const months = [firstMonth, shiftMonth(firstMonth, 1), shiftMonth(firstMonth, 2)];
  const windowFrom = `${months[0]}-01`;
  const lastMonth = months[2] as string;
  const windowTo = `${lastMonth}-${daysInMonth(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)))}`;
  const rangeFrom = selected[0] && selected[0] < windowFrom ? selected[0] : windowFrom;
  const rangeTo =
    selected.at(-1) && (selected.at(-1) as string) > windowTo
      ? (selected.at(-1) as string)
      : windowTo;

  // Existing events for markers and warnings (refetched when the visible range or selection grows).
  useEffect(() => {
    let cancelled = false;
    loadScheduleContext(rangeFrom, rangeTo).then((rows) => {
      if (!cancelled) setExisting(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo]);

  const holidays = useMemo(
    () => holidaysBetween(addDays(windowFrom, -7), addDays(windowTo, 7)),
    [windowFrom, windowTo],
  );
  const checks: CandidateCheck[] = useMemo(() => {
    if (!preset) return [];
    return checkCandidates(
      selected.map((d) => ({
        venueId: preset.venueId,
        startsOn: d,
        endsOn: endsOnFor(d, preset.durationDays),
      })),
      existing,
    );
  }, [selected, existing, preset]);
  const totalWarnings = checks.reduce((sum, c) => sum + candidateWarningCount(c), 0);

  const venueBusy = useMemo(() => {
    const days = new Set<string>();
    for (const e of existing) {
      if (e.venueId !== preset?.venueId) continue;
      for (let d = e.startsOn; d <= e.endsOn; d = addDays(d, 1)) days.add(d);
    }
    return days;
  }, [existing, preset]);
  const weekendLoad = useMemo(() => {
    const load = new Map<string, number>();
    for (const e of existing) {
      for (const saturday of weekendsTouched(e.startsOn, e.endsOn))
        load.set(saturday, (load.get(saturday) ?? 0) + 1);
    }
    return load;
  }, [existing]);

  function close() {
    router.replace(closeHref as never, { scroll: false });
  }

  function choosePreset(id: string) {
    setPresetId(id);
    const next = presets.find((p) => p.id === id);
    const r = ruleFromPreset(next?.rrule ?? null, nextYear);
    setRule(r);
    setFirstMonth(`${r.year}-${String(r.fromMonth).padStart(2, "0")}`);
    setSelected([]);
  }

  function toggle(day: string, shift: boolean) {
    setSelected((current) => {
      const set = new Set(current);
      if (shift && lastClicked && lastClicked !== day) {
        // Shift-click: the same weekday at every week between the last click and this one.
        const [a, b] = lastClicked < day ? [lastClicked, day] : [day, lastClicked];
        for (let d = a; d <= b; d = addDays(d, 7)) if (weekday(d) === weekday(day)) set.add(d);
        if (weekday(lastClicked) === weekday(day)) set.add(day);
      } else if (set.has(day)) {
        set.delete(day);
      } else {
        set.add(day);
      }
      return [...set].sort();
    });
    setLastClicked(day);
  }

  function applyRule() {
    const monthsList: number[] = [];
    for (let m = rule.fromMonth; m <= rule.toMonth; m += 1) monthsList.push(m);
    const rrule = `FREQ=MONTHLY;BYMONTH=${monthsList.join(",")};BYDAY=${CODES[rule.day]};BYSETPOS=${rule.setPos}`;
    const dates = expandRRule(rrule, `${rule.year}-01-01`, `${rule.year}-12-31`).filter(
      (d) => d > today,
    );
    setSelected(dates);
    if (dates[0]) setFirstMonth(monthKey(dates[0]));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createEvents(presetId, selected);
      if (!result.ok) {
        setError(t(`errors.${result.error}` as "errors.no_dates"));
        return;
      }
      const ids = result.data;
      close();
      showToast({
        message: t("created", { count: ids.length }),
        actionLabel: t("undo"),
        onAction: async () => {
          await undoCreateEvents(ids);
        },
      });
    });
  }

  const weekdayNames = t("weekdaysShort").split(",");
  const typeName = (p: GenerationPreset) => (locale === "en" ? p.typeNameEn : p.typeNameDe);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-40 flex w-[min(760px,100%)] flex-col border-l bg-card shadow-overlay outline-none">
          <header className="flex flex-col gap-3 border-border-subtle border-b px-5 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="font-semibold text-lg">{t("title")}</Dialog.Title>
              <Dialog.Close
                aria-label={t("close")}
                className="grid size-8 place-items-center rounded-lg hover:bg-hover"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <ol className="flex flex-wrap items-center gap-2" aria-label={t("steps")}>
              {([1, 2, 3] as const).map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span
                    aria-current={step === n ? "step" : undefined}
                    className={cn(
                      "grid size-6 place-items-center rounded-full font-semibold text-tiny",
                      n < step
                        ? "bg-status-ok-dot text-white"
                        : n === step
                          ? "bg-primary text-primary-foreground"
                          : "bg-status-neutral-bg text-foreground-2",
                    )}
                  >
                    {n}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      n === step ? "text-foreground" : "text-foreground-2",
                    )}
                  >
                    {t(`step${n}`)}
                  </span>
                  {n < 3 && <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />}
                </li>
              ))}
            </ol>
          </header>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
            {step === 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-semibold">{t("choosePreset")}</legend>
                {presets.map((p) => (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-hover",
                      presetId === p.id && "border-primary bg-selected",
                    )}
                  >
                    <input
                      type="radio"
                      name="preset"
                      value={p.id}
                      checked={presetId === p.id}
                      onChange={() => choosePreset(p.id)}
                      className="size-4 accent-(--primary)"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block truncate text-muted-foreground text-small">
                        {p.venueName}
                      </span>
                    </span>
                    <EventTypeTag typeKey={p.typeKey}>{typeName(p)}</EventTypeTag>
                  </label>
                ))}
              </fieldset>
            )}

            {step === 2 && preset && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons */}
                  <div
                    role="group"
                    aria-label={t("mode")}
                    className="inline-flex gap-0.5 rounded-lg border border-input bg-sunken p-0.5"
                  >
                    {(["click", "rule"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={mode === m}
                        onClick={() => setMode(m)}
                        className="min-h-7 cursor-pointer rounded-md px-3 font-medium text-foreground-2 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-card"
                      >
                        {t(`modes.${m}`)}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      aria-label={t("prevMonths")}
                      onClick={() => setFirstMonth(shiftMonth(firstMonth, -1))}
                    >
                      <ChevronLeft />
                    </Button>
                    <span className="min-w-36 text-center font-semibold">
                      {formatMonth(`${months[0]}-01`, locale)} –{" "}
                      {formatMonth(`${months[2]}-01`, locale)}
                    </span>
                    <Button
                      size="icon"
                      aria-label={t("nextMonths")}
                      onClick={() => setFirstMonth(shiftMonth(firstMonth, 1))}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>

                {mode === "rule" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-surface-2 p-3">
                    <span>{t("rule.every")}</span>
                    <select
                      aria-label={t("rule.position")}
                      value={rule.setPos}
                      onChange={(e) => setRule({ ...rule, setPos: Number(e.target.value) })}
                      className="min-h-(--control-h) rounded-lg border border-input bg-card px-2"
                    >
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos === -1 ? t("rule.last") : `${pos}.`}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t("rule.weekday")}
                      value={rule.day}
                      onChange={(e) => setRule({ ...rule, day: Number(e.target.value) })}
                      className="min-h-(--control-h) rounded-lg border border-input bg-card px-2"
                    >
                      {t("weekdaysLong")
                        .split(",")
                        .map((name, i) => (
                          <option key={name} value={i}>
                            {name}
                          </option>
                        ))}
                    </select>
                    <span>{t("rule.from")}</span>
                    <MonthSelect
                      label={t("rule.fromMonth")}
                      value={rule.fromMonth}
                      onChange={(v) => setRule({ ...rule, fromMonth: v })}
                      locale={locale}
                    />
                    <span>{t("rule.to")}</span>
                    <MonthSelect
                      label={t("rule.toMonth")}
                      value={rule.toMonth}
                      onChange={(v) => setRule({ ...rule, toMonth: v })}
                      locale={locale}
                    />
                    <select
                      aria-label={t("rule.year")}
                      value={rule.year}
                      onChange={(e) => setRule({ ...rule, year: Number(e.target.value) })}
                      className="min-h-(--control-h) rounded-lg border border-input bg-card px-2"
                    >
                      {[nextYear - 1, nextYear, nextYear + 1].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="default"
                      onClick={applyRule}
                      disabled={rule.fromMonth > rule.toMonth}
                    >
                      {t("rule.apply")}
                    </Button>
                  </div>
                )}

                <div className="grid gap-x-3 gap-y-4 sm:grid-cols-3">
                  {months.map((month) => (
                    <MonthPicker
                      key={month}
                      month={month}
                      locale={locale}
                      weekdayNames={weekdayNames}
                      weekLabel={t("weekShort")}
                      today={today}
                      selected={selected}
                      holidays={holidays}
                      venueBusy={venueBusy}
                      weekendLoad={weekendLoad}
                      onToggle={toggle}
                      chosenLabel={(n) => t("chosen", { n })}
                    />
                  ))}
                </div>

                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small">
                  <li className="flex items-center gap-1.5">
                    <span className="grid size-5 place-items-center rounded-md bg-primary font-semibold text-[11px] text-primary-foreground">
                      4
                    </span>
                    {t("legend.selected")}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="font-semibold text-status-critical">3</span>
                    {t("legend.holiday")}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="grid size-5 place-items-center rounded-full border-2 border-status-critical-dot font-semibold text-[11px]">
                      6
                    </span>
                    {t("legend.venueBusy")}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="border-status-warn-dot border-b-2 font-semibold">1</span>
                    {t("legend.weekendFull")}
                  </li>
                </ul>
                <p className="text-muted-foreground text-tiny">
                  <Kbd>Shift</Kbd> {t("shiftHint")}
                </p>
                <p
                  className="flex items-center gap-2 rounded-lg bg-status-info-bg px-3 py-2 text-status-info"
                  aria-live="polite"
                >
                  <CalendarDays aria-hidden className="size-4" />
                  <strong>{t("summary", { count: selected.length })}</strong>
                  {totalWarnings > 0 && (
                    <span>· {t("warningsCount", { count: totalWarnings })}</span>
                  )}
                </p>
              </>
            )}

            {step === 3 && preset && (
              <div className="flex flex-col gap-3">
                <p className="text-foreground-2">
                  {t("previewIntro", { name: preset.name, venue: preset.venueName })}
                </p>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-surface-2 text-muted-foreground text-tiny">
                      <th scope="col" className="border-b px-3 py-1.5 font-semibold">
                        {t("cols.date")}
                      </th>
                      <th scope="col" className="border-b px-3 py-1.5 font-semibold">
                        {t("cols.week")}
                      </th>
                      <th scope="col" className="border-b px-3 py-1.5 font-semibold">
                        {t("cols.notes")}
                      </th>
                      <th scope="col" className="border-b px-3 py-1.5">
                        <span className="sr-only">{t("cols.remove")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={c.startsOn} className="border-border-subtle border-b">
                        <td className="tabular h-row whitespace-nowrap px-3 font-semibold">
                          {formatDateWithWeekday(c.startsOn, locale)}
                          {c.endsOn !== c.startsOn &&
                            ` – ${formatDateWithWeekday(c.endsOn, locale)}`}
                        </td>
                        <td className="tabular px-3 text-muted-foreground">
                          {formatWeek(c.startsOn, locale)}
                        </td>
                        <td className="px-3 py-1.5">
                          <CandidateNotes check={c} />
                        </td>
                        <td className="w-10 px-2">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("remove", {
                              date: formatDateWithWeekday(c.startsOn, locale),
                            })}
                            onClick={() => setSelected((s) => s.filter((d) => d !== c.startsOn))}
                          >
                            <X />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-muted-foreground text-small">{t("previewNote")}</p>
                {error && (
                  <p role="alert" className="text-status-critical">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-border-subtle border-t bg-surface-2 px-5 py-3">
            <span className="text-muted-foreground text-small">
              {preset ? `${preset.name} · ${preset.venueName}` : ""}
            </span>
            <div className="flex gap-2">
              {step > 1 && (
                <Button onClick={() => setStep((s) => (s - 1) as 1 | 2)} disabled={pending}>
                  {t("back")}
                </Button>
              )}
              {step < 3 ? (
                <Button
                  variant="default"
                  onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                  disabled={!preset || (step === 2 && selected.length === 0)}
                >
                  {t("next")}
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={submit}
                  disabled={pending || selected.length === 0}
                  aria-busy={pending}
                >
                  {pending ? t("creating") : t("create", { count: selected.length })}
                </Button>
              )}
            </div>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MonthSelect({
  label,
  value,
  onChange,
  locale,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  locale: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="min-h-(--control-h) rounded-lg border border-input bg-card px-2"
    >
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
        <option key={m} value={m}>
          {new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
            month: "short",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(2026, m - 1, 15)))}
        </option>
      ))}
    </select>
  );
}

function MonthPicker({
  month,
  locale,
  weekdayNames,
  weekLabel,
  today,
  selected,
  holidays,
  venueBusy,
  weekendLoad,
  onToggle,
  chosenLabel,
}: {
  month: string;
  locale: string;
  weekdayNames: string[];
  weekLabel: string;
  today: string;
  selected: string[];
  holidays: Map<string, { nameDe: string; nameEn: string }>;
  venueBusy: Set<string>;
  weekendLoad: Map<string, number>;
  onToggle: (day: string, shift: boolean) => void;
  chosenLabel: (n: number) => string;
}) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = isoDate(y, m, 1);
  const last = isoDate(y, m, daysInMonth(y, m));
  const weeks: string[][] = [];
  for (let d = mondayOf(first); d <= last; d = addDays(d, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const chosen = selected.filter((d) => d.startsWith(month)).length;
  return (
    <div className="min-w-0">
      <h3 className="mb-1 font-semibold">
        {formatMonth(first, locale)}{" "}
        <span className="font-normal text-muted-foreground text-tiny">· {chosenLabel(chosen)}</span>
      </h3>
      <table className="w-full table-fixed border-collapse text-center">
        <thead>
          <tr className="text-muted-foreground text-[11px]">
            <th scope="col" className="w-6 font-semibold text-[10px]">
              {weekLabel}
            </th>
            {weekdayNames.map((n) => (
              <th key={n} scope="col" className="font-semibold">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              <th scope="row" className="w-6 font-normal text-[10px] text-faint-foreground">
                {isoWeek(week[0] as string).week}
              </th>
              {week.map((day) => {
                if (day < first || day > last) return <td key={day} />;
                const holiday = holidays.get(day);
                const isSelected = selected.includes(day);
                const busy = venueBusy.has(day);
                const dow = weekday(day);
                const saturday = dow === 6 ? day : dow === 0 ? addDays(day, -1) : null;
                const full = saturday !== null && (weekendLoad.get(saturday) ?? 0) >= 3;
                const past = day <= today;
                const name = holiday
                  ? locale === "en"
                    ? holiday.nameEn
                    : holiday.nameDe
                  : undefined;
                return (
                  <td key={day} className="p-0">
                    <button
                      type="button"
                      disabled={past}
                      aria-pressed={isSelected}
                      title={name}
                      aria-label={`${formatDateWithWeekday(day, locale)}${name ? `, ${name}` : ""}${busy ? " ⚠" : ""}`}
                      onClick={(e) => onToggle(day, e.shiftKey)}
                      className={cn(
                        "tabular relative mx-auto grid size-7 cursor-pointer place-items-center rounded-lg text-small hover:bg-hover disabled:cursor-not-allowed disabled:opacity-35",
                        (dow === 6 || dow === 0) && "font-semibold",
                        holiday && "text-status-critical",
                        busy && "rounded-full border-2 border-status-critical-dot",
                        full && "border-status-warn-dot border-b-2",
                        isSelected &&
                          "bg-primary font-semibold text-primary-foreground hover:bg-primary-hover",
                      )}
                    >
                      {Number(day.slice(8, 10))}
                      {holiday && (
                        <span
                          aria-hidden
                          className="absolute top-0.5 size-1 rounded-full bg-status-critical-dot"
                        />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
