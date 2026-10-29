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
  weekday,
  weekendsTouched,
} from "@marktwerk/core";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CopyCheck,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createEvents,
  previewGeneratedEvents,
  undoCreateEvents,
} from "@/app/(app)/veranstaltungen/actions";
import { CandidateNotes, candidateWarningCount } from "@/components/events/candidate-notes";
import { NewMarketForm } from "@/components/events/new-market-form";
import { useScheduleContextState } from "@/components/events/schedule-hints";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Kbd } from "@/components/ui/kbd";
import { MarketMarker } from "@/components/ui/market-marker";
import { formatDate, formatDateWithWeekday, formatMonth, formatWeek, todayIn } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventTypeOption } from "@/server/queries/event-form";
import type { DatePreview, GenerationPreview } from "@/server/queries/generation-preview";
import type { GenerationPreset } from "@/server/queries/presets";
import type { VenueOption } from "@/server/queries/venues";

const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const POSITIONS = [1, 2, 3, 4, -1] as const;

const CHIP =
  "inline-flex min-h-7 cursor-pointer items-center rounded-full border border-input bg-card px-3 font-medium text-small hover:bg-hover touch:min-h-10";

function monthKey(date: string) {
  return date.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The same day number `by` months later (the last day of a shorter month). */
function shiftDayByMonths(day: string, by: number): string {
  const month = shiftMonth(monthKey(day), by);
  const [y, m] = month.split("-").map(Number) as [number, number];
  return isoDate(y, m, Math.min(Number(day.slice(8, 10)), daysInMonth(y, m)));
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

type PreviewState =
  | { state: "idle" | "loading" | "error" }
  | { state: "ready"; data: GenerationPreview };

/**
 * "Markt planen" (UX concept, wireframe W5): 3 steps in a side sheet: (1) market, searchable, with
 * "Neuen Markt anlegen" on top, (2) dates in a 3-month calendar or by rule, with NRW holidays and conflict
 * markers, (3) preview with warnings, tasks and permits per date, then one call to the
 * `createEventsFromPreset` service. A market that was just created continues straight at step 2.
 * Warnings never block; the office decides. A date the market already has is "Gibt es schon" and is left
 * out unless the office adds it anyway ("Doch anlegen").
 */
export function GenerateSheet({
  presets,
  initialPresetId,
  closeHref,
  canCreateMarket = false,
  marketOptions,
  openNewMarket = false,
}: {
  presets: GenerationPreset[];
  initialPresetId?: string;
  closeHref: string;
  /** template:write: shows "Neuen Markt anlegen"; `marketOptions` then holds the form's choices. */
  canCreateMarket?: boolean;
  marketOptions?: { types: EventTypeOption[]; venues: VenueOption[] };
  /** Open with the new-market form (`?neu=1`). */
  openNewMarket?: boolean;
}) {
  const t = useTranslations("generate");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const today = todayIn();
  const nextYear = Number(today.slice(0, 4)) + 1;

  // Markets created in this sheet show up at once; the server list catches up after the refresh.
  const [created, setCreated] = useState<GenerationPreset[]>([]);
  const all = useMemo(
    () => [...created.filter((c) => !presets.some((p) => p.id === c.id)), ...presets],
    [created, presets],
  );
  const [step, setStep] = useState<1 | 2 | 3>(
    initialPresetId && presets.some((p) => p.id === initialPresetId) ? 2 : 1,
  );
  const [presetId, setPresetId] = useState(
    presets.some((p) => p.id === initialPresetId) ? (initialPresetId as string) : "",
  );
  const [query, setQuery] = useState("");
  const [creatingMarket, setCreatingMarket] = useState(canCreateMarket && openNewMarket);
  const [noTasksFor, setNoTasksFor] = useState<string | null>(null);
  const preset = all.find((p) => p.id === presetId);
  const needle = query.trim().toLocaleLowerCase(locale);
  const shown = needle
    ? all.filter(
        (p) =>
          p.name.toLocaleLowerCase(locale).includes(needle) ||
          p.venueName.toLocaleLowerCase(locale).includes(needle),
      )
    : all;
  const [mode, setMode] = useState<"click" | "rule">("rule");
  const [rule, setRule] = useState(() => ruleFromPreset(preset?.rrule ?? null, nextYear));
  const [firstMonth, setFirstMonth] = useState(
    `${nextYear}-${String(rule.fromMonth).padStart(2, "0")}`,
  );
  const [selected, setSelected] = useState<string[]>([]);
  /** Dates that exist already but are created anyway ("Doch anlegen"). */
  const [readded, setReaded] = useState<string[]>([]);
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState<string | null>(null);
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
  const {
    existing,
    state: contextState,
    retry: retryContext,
  } = useScheduleContextState(rangeFrom, rangeTo);
  const notesState =
    contextState === "ready" ? "ready" : contextState === "error" ? "error" : "loading";

  const holidays = useMemo(
    () => holidaysBetween(addDays(windowFrom, -7), addDays(windowTo, 7)),
    [windowFrom, windowTo],
  );

  // Dates this market already has (same market, same first day): "Gibt es schon".
  const existingOfMarket = useMemo(() => {
    const byDate = new Map<string, { id: string; name: string }>();
    for (const e of existing) {
      if (preset && e.presetId === preset.id) byDate.set(e.startsOn, { id: e.id, name: e.name });
    }
    return byDate;
  }, [existing, preset]);
  const skippedDays = useMemo(
    () => new Set(selected.filter((d) => existingOfMarket.has(d) && !readded.includes(d))),
    [selected, readded, existingOfMarket],
  );
  const isSkipped = (day: string) => skippedDays.has(day);
  const toCreate = useMemo(
    () => selected.filter((d) => !skippedDays.has(d)),
    [selected, skippedDays],
  );
  const skipped = skippedDays.size;

  const checks: CandidateCheck[] = useMemo(() => {
    if (!preset) return [];
    return checkCandidates(
      toCreate.map((d) => ({
        venueId: preset.venueId,
        startsOn: d,
        endsOn: endsOnFor(d, preset.durationDays),
      })),
      existing,
    );
  }, [toCreate, existing, preset]);
  const checkOf = useMemo(() => new Map(checks.map((c) => [c.startsOn, c])), [checks]);
  const totalWarnings = checks.reduce((sum, c) => sum + candidateWarningCount(c), 0);

  const venueBusy = useMemo(() => {
    const days = new Set<string>();
    for (const e of existing) {
      if (e.venueId !== preset?.venueId) continue;
      for (let d = e.startsOn; d <= e.endsOn; d = addDays(d, 1)) days.add(d);
    }
    return days;
  }, [existing, preset]);
  /** Names of the events on each weekend (keyed by Saturday): the weekend marker and the preview say which. */
  const weekendMarkets = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const e of existing) {
      for (const saturday of weekendsTouched(e.startsOn, e.endsOn))
        names.set(saturday, [...(names.get(saturday) ?? []), e.name]);
    }
    return names;
  }, [existing]);

  // Step 3: what the dates bring along (tasks, tasks due on day one, permits), worked out on the server.
  const [preview, setPreview] = useState<PreviewState>({ state: "idle" });
  const createKey = toCreate.join(",");
  useEffect(() => {
    if (step !== 3 || !presetId || createKey === "") {
      setPreview({ state: "idle" });
      return;
    }
    let cancelled = false;
    setPreview({ state: "loading" });
    previewGeneratedEvents(presetId, createKey.split(",")).then(
      (result) => {
        if (!cancelled)
          setPreview(result.ok ? { state: "ready", data: result.data } : { state: "error" });
      },
      () => {
        if (!cancelled) setPreview({ state: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [step, presetId, createKey]);
  const previewOf = useMemo(
    () =>
      new Map<string, DatePreview>(
        preview.state === "ready" ? preview.data.dates.map((d) => [d.startsOn, d]) : [],
      ),
    [preview],
  );
  const totals = useMemo(() => {
    const sum = { tasks: 0, dueNow: 0, covered: 0, fresh: 0 };
    for (const d of previewOf.values()) {
      sum.tasks += d.tasks;
      sum.dueNow += d.dueNow;
      sum.covered += d.permitsCovered;
      sum.fresh += d.permitsNew;
    }
    return sum;
  }, [previewOf]);

  // Calendar keyboard: one tab stop (roving), arrows move by day / week, Page keys by month.
  const gridRef = useRef<HTMLFieldSetElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  });
  const firstFree = (() => {
    let d = windowFrom;
    while (d <= today && d <= windowTo) d = addDays(d, 1);
    return d;
  })();
  const tabDay =
    focusDay && focusDay >= windowFrom && focusDay <= windowTo && focusDay > today
      ? focusDay
      : (selected.find((d) => d >= windowFrom && d <= windowTo && d > today) ?? firstFree);

  function onGridKeyDown(event: React.KeyboardEvent<HTMLFieldSetElement>) {
    const day = (event.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day;
    if (!day || event.altKey || event.ctrlKey || event.metaKey) return;
    const next =
      event.key === "ArrowLeft"
        ? addDays(day, -1)
        : event.key === "ArrowRight"
          ? addDays(day, 1)
          : event.key === "ArrowUp"
            ? addDays(day, -7)
            : event.key === "ArrowDown"
              ? addDays(day, 7)
              : event.key === "Home"
                ? mondayOf(day)
                : event.key === "End"
                  ? addDays(mondayOf(day), 6)
                  : event.key === "PageUp"
                    ? shiftDayByMonths(day, -1)
                    : event.key === "PageDown"
                      ? shiftDayByMonths(day, 1)
                      : null;
    if (!next) return;
    event.preventDefault();
    // Past days are disabled: the move stops at today.
    if (next <= today || next === day) return;
    setFocusDay(next);
    if (next < windowFrom) setFirstMonth(monthKey(next));
    else if (next > windowTo) setFirstMonth(shiftMonth(monthKey(next), -2));
    pendingFocus.current = next;
  }

  function close() {
    router.replace(closeHref as never, { scroll: false });
  }

  function choosePreset(id: string) {
    setPresetId(id);
    const next = all.find((p) => p.id === id);
    const r = ruleFromPreset(next?.rrule ?? null, nextYear);
    setRule(r);
    setFirstMonth(`${r.year}-${String(r.fromMonth).padStart(2, "0")}`);
    setSelected([]);
    setReaded([]);
    setFocusDay(null);
  }

  /** A market made in this sheet: select it and go on to its dates. */
  function marketCreated(market: GenerationPreset, template: { items: number } | null) {
    setCreated((list) => [market, ...list]);
    choosePreset(market.id);
    setNoTasksFor(template === null ? market.id : null);
    setCreatingMarket(false);
    setStep(2);
    showToast({
      message: template
        ? t("market.created", { name: market.name, count: template.items })
        : t("market.createdNoTasks", { name: market.name }),
    });
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
    setReaded([]);
    if (dates[0]) setFirstMonth(monthKey(dates[0]));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createEvents(presetId, toCreate);
      if (!result.ok) {
        setError(t(`errors.${result.error}` as "errors.no_dates"));
        return;
      }
      const ids = result.data;
      // One date: its page (Überblick with tasks and permits). Several: the list, narrowed to the new ones.
      const first = ids[0];
      if (ids.length > 1) router.push(`/veranstaltungen?angelegt=${ids.join(",")}` as never);
      else if (first) router.push(`/veranstaltungen/${first}` as never);
      else close();
      showToast({
        message: t("created", { count: ids.length }),
        actionLabel: t("undo"),
        onAction: async () => {
          await undoCreateEvents(ids);
          // The page we moved to belonged to one of the undone events.
          router.push("/veranstaltungen" as never);
        },
      });
    });
  }

  const weekdayNames = t("weekdaysShort").split(",");
  const typeName = (p: Pick<GenerationPreset, "typeNameEn" | "typeNameDe">) =>
    locale === "en" ? p.typeNameEn : p.typeNameDe;
  const permitText = (p: Pick<DatePreview, "permitsCovered" | "permitsNew">) =>
    p.permitsCovered + p.permitsNew === 0
      ? t("preview.permitsNone")
      : t("preview.permits", { covered: p.permitsCovered, fresh: p.permitsNew });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-40 flex w-[min(760px,100%)] flex-col border-l bg-card shadow-overlay outline-hidden">
          <header className="flex flex-col gap-3 border-border-subtle border-b px-5 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="font-semibold text-lg">{t("title")}</Dialog.Title>
              <Dialog.Close
                aria-label={t("close")}
                className="grid size-8 place-items-center rounded-lg hover:bg-hover touch:size-10"
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
                        ? "bg-status-ok-dot text-on-ok"
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
            {step === 1 && creatingMarket && marketOptions && (
              <NewMarketForm
                types={marketOptions.types}
                venues={marketOptions.venues}
                initialName={query.trim()}
                onCreated={marketCreated}
                onCancel={() => setCreatingMarket(false)}
              />
            )}

            {step === 1 && !creatingMarket && (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search
                    aria-hidden
                    className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
                  />
                  <input
                    type="search"
                    // biome-ignore lint/a11y/noAutofocus: the sheet was opened to pick a market, typing starts the search
                    autoFocus
                    value={query}
                    aria-label={t("searchLabel")}
                    placeholder={t("search")}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const first = shown[0];
                      if (first) {
                        choosePreset(first.id);
                        setStep(2);
                      } else if (canCreateMarket && marketOptions && query.trim() !== "") {
                        setCreatingMarket(true);
                      }
                    }}
                    className="min-h-(--control-h) w-full rounded-lg border border-input bg-card pr-3 pl-9"
                  />
                </div>
                <fieldset className="flex min-w-0 flex-col gap-2">
                  <legend className="mb-2 font-semibold">{t("choosePreset")}</legend>
                  {canCreateMarket && marketOptions && (
                    <button
                      type="button"
                      onClick={() => setCreatingMarket(true)}
                      className="flex items-center gap-3 rounded-lg border border-primary border-dashed px-3 py-2 text-left hover:bg-hover"
                    >
                      <Plus aria-hidden className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t("market.new")}</span>
                        <span className="block text-muted-foreground text-small">
                          {t("market.newHint")}
                        </span>
                      </span>
                    </button>
                  )}
                  {shown.length === 0 && (
                    <p className="px-1 py-2 text-muted-foreground">
                      {all.length === 0 ? t("noMarkets") : t("noMatch", { query: query.trim() })}
                    </p>
                  )}
                  {shown.map((p) => (
                    <label
                      key={p.id}
                      className={cn(
                        "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 hover:bg-hover",
                        presetId === p.id && "border-primary bg-selected",
                      )}
                    >
                      <input
                        type="radio"
                        name="preset"
                        value={p.id}
                        checked={presetId === p.id}
                        onChange={() => choosePreset(p.id)}
                        className="mt-1 size-4 shrink-0 accent-(--primary)"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-semibold">
                          <MarketMarker color={p.color} typeKey={p.typeKey} />
                          <span className="min-w-0 break-words">{p.name}</span>
                        </span>
                        <span className="block text-muted-foreground text-small">
                          {p.venueName} ·{" "}
                          {p.lastHeldOn
                            ? t("lastHeld", { date: formatDate(p.lastHeldOn, locale) })
                            : t("neverHeld")}
                        </span>
                        <span
                          className={cn(
                            "block text-small",
                            (p.plannedBySeason[nextYear] ?? 0) > 0
                              ? "text-foreground-2"
                              : "text-muted-foreground",
                          )}
                        >
                          {t("plannedIn", {
                            year: nextYear,
                            count: p.plannedBySeason[nextYear] ?? 0,
                          })}
                        </span>
                        <EventTypeTag typeKey={p.typeKey} className="mt-1 sm:hidden">
                          {typeName(p)}
                        </EventTypeTag>
                      </span>
                      <EventTypeTag typeKey={p.typeKey} className="max-sm:hidden">
                        {typeName(p)}
                      </EventTypeTag>
                    </label>
                  ))}
                </fieldset>
              </div>
            )}

            {step === 2 && preset && (
              <>
                {noTasksFor === preset.id && (
                  <p role="status" className="text-muted-foreground text-small">
                    {t("market.noMasterNote")}
                  </p>
                )}
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
                        className="min-h-7 cursor-pointer rounded-md px-3 font-medium text-foreground-2 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-card touch:min-h-10"
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
                    {selected.length > 0 && (
                      <span className="basis-full text-muted-foreground text-small">
                        {t("rule.replaces", { count: selected.length })}
                      </span>
                    )}
                  </div>
                )}

                <fieldset
                  ref={gridRef}
                  onKeyDown={onGridKeyDown}
                  className="m-0 grid min-w-0 gap-x-3 gap-y-4 border-0 p-0 sm:grid-cols-3"
                >
                  <legend className="sr-only">{t("calendarLabel")}</legend>
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
                      weekendMarkets={weekendMarkets}
                      tabDay={tabDay}
                      onFocusDay={setFocusDay}
                      onToggle={toggle}
                      chosenLabel={(n) => t("chosen", { n })}
                      labels={{
                        busy: t("day.busy"),
                        weekendFull: t("day.weekendFull"),
                        weekendWith: (names) => t("warn.weekendWith", { names }),
                      }}
                    />
                  ))}
                </fieldset>

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
                    <span className="relative grid size-5 place-items-center font-semibold text-[11px]">
                      1
                      <span
                        aria-hidden
                        className="absolute inset-x-0.5 bottom-0 h-[3px] rounded-full bg-status-warn-dot"
                      />
                    </span>
                    {t("legend.weekendFull")}
                  </li>
                </ul>
                <p className="touch:hidden text-muted-foreground text-tiny">
                  <Kbd>Shift</Kbd> {t("shiftHint")} · {t("keysHint")}
                </p>
                <div
                  className="flex flex-col gap-1 rounded-lg bg-status-info-bg px-3 py-2 text-status-info"
                  aria-live="polite"
                >
                  <p className="flex flex-wrap items-center gap-x-2">
                    <CalendarDays aria-hidden className="size-4" />
                    <strong>{t("summary", { count: selected.length })}</strong>
                    {skipped > 0 && <span>· {t("skippedCount", { count: skipped })}</span>}
                    {totalWarnings > 0 && (
                      <span>· {t("warningsCount", { count: totalWarnings })}</span>
                    )}
                    {contextState === "loading" && <span>· {t("context.loading")}</span>}
                  </p>
                  {contextState === "error" && (
                    <p role="alert" className="flex flex-wrap items-center gap-2 text-status-warn">
                      {t("context.failed")}
                      <button type="button" onClick={retryContext} className={CHIP}>
                        {t("context.retry")}
                      </button>
                    </p>
                  )}
                </div>
              </>
            )}

            {step === 3 && preset && (
              <div className="flex flex-col gap-3">
                <p className="text-foreground-2">
                  {t("previewIntro", { name: preset.name, venue: preset.venueName })}
                </p>
                {preview.state === "ready" && preview.data.noTemplate && (
                  <p role="status" className="text-muted-foreground text-small">
                    {t("preview.noTemplate")}
                  </p>
                )}
                {preview.state === "error" && (
                  <p role="alert" className="text-small text-status-warn">
                    {t("preview.failed")}
                  </p>
                )}
                {contextState === "error" && (
                  <p
                    role="alert"
                    className="flex flex-wrap items-center gap-2 text-small text-status-warn"
                  >
                    {t("context.failed")}
                    <button type="button" onClick={retryContext} className={CHIP}>
                      {t("context.retry")}
                    </button>
                  </p>
                )}
                {toCreate.length === 0 && (
                  <p
                    role="status"
                    className="rounded-lg bg-status-info-bg px-3 py-2 text-status-info"
                  >
                    {t("allExist")}
                  </p>
                )}
                <ul aria-label={t("cols.date")} className="overflow-hidden rounded-lg border">
                  {selected.map((day) => {
                    const endsOn = endsOnFor(day, preset.durationDays);
                    const dup = existingOfMarket.get(day);
                    const skippedRow = isSkipped(day);
                    const check = checkOf.get(day);
                    const rowPreview = previewOf.get(day);
                    const dayLabel = formatDateWithWeekday(day, locale);
                    return (
                      <li
                        key={day}
                        className={cn(
                          "grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 border-border-subtle border-b px-3 py-2 last:border-b-0 sm:grid-cols-[11rem_1fr_auto]",
                          skippedRow && "bg-sunken text-muted-foreground",
                        )}
                      >
                        <div className="tabular">
                          <div className={cn("font-semibold", !skippedRow && "text-foreground")}>
                            {dayLabel}
                            {endsOn !== day && ` – ${formatDateWithWeekday(endsOn, locale)}`}
                          </div>
                          <div className="text-muted-foreground text-small">
                            {formatWeek(day, locale)}
                          </div>
                        </div>
                        <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                          {dup && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 font-medium text-small",
                                  skippedRow ? "text-foreground-2" : "text-status-warn",
                                )}
                              >
                                <CopyCheck aria-hidden className="size-4 shrink-0" />
                                {skippedRow ? t("dup.exists") : t("dup.addedAgain")}
                              </span>
                              <button
                                type="button"
                                className={CHIP}
                                onClick={() =>
                                  setReaded((list) =>
                                    skippedRow ? [...list, day] : list.filter((d) => d !== day),
                                  )
                                }
                              >
                                {skippedRow ? t("dup.addAnyway") : t("dup.skip")}
                              </button>
                            </div>
                          )}
                          {skippedRow && dup && (
                            <p className="text-small">{t("dup.detail", { name: dup.name })}</p>
                          )}
                          {!skippedRow && (
                            <>
                              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small">
                                {rowPreview ? (
                                  <>
                                    <span className="tabular">
                                      {t("preview.tasks", { count: rowPreview.tasks })}
                                    </span>
                                    {rowPreview.dueNow > 0 && (
                                      <span className="inline-flex items-center gap-1 text-status-critical">
                                        <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                                        {t("preview.dueNow", { count: rowPreview.dueNow })}
                                      </span>
                                    )}
                                    <span className="text-foreground-2">
                                      {permitText(rowPreview)}
                                    </span>
                                  </>
                                ) : preview.state === "loading" ? (
                                  <span className="text-muted-foreground">
                                    {t("preview.loading")}
                                  </span>
                                ) : null}
                              </p>
                              {check && (
                                <CandidateNotes
                                  check={check}
                                  state={notesState}
                                  weekendMarkets={weekendMarkets}
                                />
                              )}
                            </>
                          )}
                        </div>
                        <div className="col-start-2 row-start-1 sm:col-start-3">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="touch:size-10"
                            aria-label={t("remove", { date: dayLabel })}
                            onClick={() => {
                              setSelected((s) => s.filter((d) => d !== day));
                              setReaded((r) => r.filter((d) => d !== day));
                            }}
                          >
                            <X />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-muted-foreground text-small">{t("previewNote")}</p>
                {error && (
                  <p role="alert" className="text-status-critical">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          <footer className="flex flex-col gap-2 border-border-subtle border-t bg-surface-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="min-w-0 text-muted-foreground text-small"
              aria-live={step === 3 ? "polite" : undefined}
            >
              {step === 3 && toCreate.length > 0 ? (
                preview.state === "ready" ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <strong className="font-semibold text-foreground">
                      {t("preview.tasks", { count: totals.tasks })}
                    </strong>
                    {totals.dueNow > 0 && (
                      <span className="inline-flex items-center gap-1 text-status-critical">
                        · <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                        {t("preview.dueNow", { count: totals.dueNow })}
                      </span>
                    )}
                    <span>
                      · {permitText({ permitsCovered: totals.covered, permitsNew: totals.fresh })}
                    </span>
                  </span>
                ) : preview.state === "error" ? null : (
                  t("preview.loading")
                )
              ) : preset ? (
                <span className="block truncate">{`${preset.name} · ${preset.venueName}`}</span>
              ) : null}
            </div>
            <div
              className={cn(
                "flex w-full justify-end gap-2 sm:w-auto",
                step === 1 && creatingMarket && "hidden",
              )}
            >
              {step > 1 && (
                <Button
                  className="max-sm:flex-1"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2)}
                  disabled={pending}
                >
                  {t("back")}
                </Button>
              )}
              {step < 3 ? (
                <Button
                  variant="default"
                  className="max-sm:flex-1"
                  onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                  disabled={!preset || (step === 2 && selected.length === 0)}
                >
                  {t("next")}
                </Button>
              ) : (
                <Button
                  variant="default"
                  className="max-sm:flex-1"
                  onClick={submit}
                  // Not while the existing events load: "Gibt es schon" is only known afterwards.
                  disabled={pending || toCreate.length === 0 || contextState === "loading"}
                  aria-busy={pending}
                >
                  {pending
                    ? t("creating")
                    : skipped > 0
                      ? t("createWithSkipped", { count: toCreate.length, skipped })
                      : t("create", { count: toCreate.length })}
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
  weekendMarkets,
  tabDay,
  onFocusDay,
  onToggle,
  chosenLabel,
  labels,
}: {
  month: string;
  locale: string;
  weekdayNames: string[];
  weekLabel: string;
  today: string;
  selected: string[];
  holidays: Map<string, { nameDe: string; nameEn: string }>;
  venueBusy: Set<string>;
  /** Names of the events per weekend (keyed by Saturday); 3 or more = the weekend is full. */
  weekendMarkets: Map<string, string[]>;
  /** The one day that is a tab stop (roving tabindex). */
  tabDay: string;
  onFocusDay: (day: string) => void;
  onToggle: (day: string, shift: boolean) => void;
  chosenLabel: (n: number) => string;
  labels: { busy: string; weekendFull: string; weekendWith: (names: string) => string };
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
                const weekendNames = saturday ? (weekendMarkets.get(saturday) ?? []) : [];
                const full = weekendNames.length >= 3;
                const past = day <= today;
                const name = holiday
                  ? locale === "en"
                    ? holiday.nameEn
                    : holiday.nameDe
                  : undefined;
                // Tooltip and screen reader text carry what the markers show (colour alone is not enough).
                const notes = [
                  name,
                  busy ? labels.busy : undefined,
                  full
                    ? `${labels.weekendFull} (${labels.weekendWith(weekendNames.join(", "))})`
                    : undefined,
                ].filter(Boolean);
                return (
                  <td key={day} className="p-0">
                    <button
                      type="button"
                      disabled={past}
                      data-day={day}
                      tabIndex={day === tabDay ? 0 : -1}
                      aria-pressed={isSelected}
                      title={notes.length > 0 ? notes.join(" · ") : undefined}
                      aria-label={`${formatDateWithWeekday(day, locale)}${notes.length > 0 ? `, ${notes.join(", ")}` : ""}`}
                      onFocus={() => onFocusDay(day)}
                      onClick={(e) => onToggle(day, e.shiftKey)}
                      className={cn(
                        "tabular relative mx-auto grid size-7 cursor-pointer place-items-center rounded-lg text-small hover:bg-hover disabled:cursor-not-allowed disabled:opacity-35 max-sm:size-10",
                        (dow === 6 || dow === 0) && "font-semibold",
                        holiday && "text-status-critical",
                        busy && "rounded-full border-2 border-status-critical-dot",
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
                      {/* Own element, so a venue-busy ring and a full weekend show together. */}
                      {full && (
                        <span
                          aria-hidden
                          className="absolute inset-x-1.5 bottom-[3px] h-[3px] rounded-full bg-status-warn-dot"
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
