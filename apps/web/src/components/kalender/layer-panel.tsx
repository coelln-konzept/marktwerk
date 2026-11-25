"use client";

import { ChevronDown, Layers as LayersIcon, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveKalenderLayers } from "@/app/(app)/kalender/actions";
import { type EventTypeKey, EventTypeSquare } from "@/components/ui/event-type-tag";
import { FilterGroup } from "@/components/ui/filter-bar";
import { MarketMarker } from "@/components/ui/market-marker";
import { UI_STATE_COOKIES, writeUiState } from "@/lib/ui-state";
import { cn } from "@/lib/utils";
import type { CalendarLayer } from "@/server/queries/due";
import { LAYER_ICONS } from "./deadline-chip";
import {
  activePreset,
  DEADLINE_GROUPS,
  DEFAULT_LAYERS,
  type Layers,
  layerParams,
  PRESETS,
  type PresetKey,
} from "./layers";

/** One market of the Märkte group (Monat, Liste): the same filter as the Jahr legend (`?ohne=`). */
export type MarketOption = {
  /** Preset id, or the key of the Einzeltermine. */
  key: string;
  name: string;
  code: string | null;
  color: string | null;
  typeKey: string | null;
  /** Events in the shown range (of the shown types, after the narrowing), also while it is switched off. */
  count: number;
  hidden: boolean;
};

type Props = {
  /** The toolbar row of the page (navigation, view switch); the "Ebenen" button joins it on the right. */
  toolbar: React.ReactNode;
  /** The calendar itself. */
  children: React.ReactNode;
  /** Remembered state of the panel (cookie); collapsed until someone opens it. */
  defaultOpen: boolean;
  layers: Layers;
  /** Events per type in the shown range, after the narrowing. */
  counts: Record<string, number>;
  typeKeys: string[];
  /** Module layers this person may see (permissions); the others are not offered at all. */
  available: CalendarLayer[];
  /** Entries per module layer in the shown range, after the narrowing. */
  deadlineCounts: Record<string, number>;
  holidayCount: number;
  visibleCount: number;
  venues: { id: string; name: string }[];
  /** Offer "Nur meine Zuständigkeit" (needs a team member, so never while Team is hidden). */
  canMine: boolean;
  /** Search params to keep when layers change (ansicht, monat, ab). */
  keep: Record<string, string>;
  /** How many layers differ from the default selection (shown on the collapsed button). */
  changedCount: number;
  /** The changes in words ("Aus: Feiertage NRW · Eingegrenzt: Neuss"), the button's tooltip and spoken text. */
  changedSummary?: string;
  /** The markets of the shown range (Monat, Liste); switching one off hides its events (`?ohne=`). */
  markets?: MarketOption[];
  /**
   * Only the event layers (Jahr view): no presets and no Fristen/Team groups, since the Jahresübersicht
   * shows markets and holidays only. The saved selection of those layers is kept as it is.
   */
  eventsOnly?: boolean;
};

const DESKTOP = "(min-width: 1024px)";

/** `lg` and up: the panel sits beside the calendar; below it opens as a sheet over it. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

/**
 * The Kalender's toolbar, "Ebenen" button and panel. The panel is collapsed by default and remembers
 * being opened. It is a GET form whose state lives in the URL: changing a layer navigates (and saves
 * the selection per person via a server action); without JavaScript the "Übernehmen" button submits
 * the same form.
 */
export function LayerPanel({
  toolbar,
  children,
  defaultOpen,
  layers,
  counts,
  typeKeys,
  available,
  deadlineCounts,
  holidayCount,
  visibleCount,
  venues,
  canMine,
  keep,
  changedCount,
  changedSummary,
  markets = [],
  eventsOnly = false,
}: Props) {
  const t = useTranslations("kalenderPage.layers");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const desktop = useIsDesktop();
  // `open` is the remembered state beside the calendar (cookie); the sheet below `lg` always starts closed.
  const [open, setOpen] = useState(defaultOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const preset = activePreset(layers, available);
  const expanded = desktop ? open : sheetOpen;

  function toggle() {
    if (!desktop) {
      setSheetOpen((v) => !v);
      return;
    }
    const next = !open;
    setOpen(next);
    writeUiState(UI_STATE_COOKIES.calendarLayers, next);
  }

  // Esc closes the sheet and gives the focus back to the button.
  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setSheetOpen(false);
      buttonRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  /** `hidden` replaces the switched-off markets (`ohne`); left out, they stay as they are. */
  function apply(next: Layers, hidden?: string[]) {
    const params = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(layerParams(next))) if (v !== undefined) params.set(k, v);
    if (hidden !== undefined) {
      if (hidden.length > 0) params.set("ohne", [...hidden].sort().join(","));
      else params.delete("ohne");
    }
    void saveKalenderLayers(next).catch(() => {});
    startTransition(() => router.replace(`/kalender?${params}` as never, { scroll: false }));
  }

  function hiddenFromForm(): string[] | undefined {
    if (markets.length === 0) return undefined;
    const data = new FormData(formRef.current as HTMLFormElement);
    const on = data.getAll("markt");
    // Switched-off markets that are not listed here (no dates in this range) stay switched off.
    const listed = new Set(markets.map((m) => m.key));
    const elsewhere = (keep.ohne ?? "").split(",").filter((k) => k && !listed.has(k));
    return [...elsewhere, ...markets.filter((m) => !on.includes(m.key)).map((m) => m.key)];
  }

  function fromForm(): Layers {
    const data = new FormData(formRef.current as HTMLFormElement);
    return {
      types: typeKeys.filter((k) => data.getAll("typ").includes(k)),
      // Layers this person cannot see are not in the form; keep whatever was saved for them.
      deadlines: [
        ...layers.deadlines.filter((l) => !available.includes(l)),
        ...available.filter((l) => data.getAll("frist").includes(l)),
      ],
      holidays: data.has("feiertage"),
      critical: data.has("kritisch"),
      mine: canMine && data.has("meine"),
      venue: (data.get("ort") as string) || null,
    };
  }

  function applyPreset(key: PresetKey) {
    const p = PRESETS.find((x) => x.key === key);
    if (p)
      apply({ ...layers, types: [...p.types], deadlines: [...p.deadlines], holidays: p.holidays });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          {changedCount > 0 && (
            <button
              type="button"
              // Monat and Liste also show every market again; the Jahr legend has its own "Alle zeigen".
              onClick={() => apply(DEFAULT_LAYERS, eventsOnly ? undefined : [])}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 font-medium text-accent-soft-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <RotateCcw aria-hidden className="size-3.5" />
              {t("reset")}
            </button>
          )}
          <button
            ref={buttonRef}
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls="kalender-layers"
            title={changedCount > 0 ? changedSummary : undefined}
            className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover aria-expanded:bg-hover"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
            ) : (
              <LayersIcon aria-hidden className="size-4" />
            )}
            {t("title")}
            {changedCount > 0 && (
              <span className="tabular font-semibold text-accent-soft-foreground">
                · {t("changed", { count: changedCount })}
                {changedSummary && <span className="sr-only">: {changedSummary}</span>}
              </span>
            )}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>
      {sheetOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("close")}
          onClick={() => setSheetOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/30 lg:hidden"
        />
      )}
      <div
        className={cn(
          "grid items-start gap-4 print:block",
          open && "lg:grid-cols-[260px_minmax(0,1fr)]",
        )}
      >
        <aside
          id="kalender-layers"
          aria-label={t("title")}
          aria-busy={pending}
          className={cn(
            "rounded-xl border bg-card lg:sticky lg:top-4 lg:self-start print:hidden",
            open ? "lg:block" : "lg:hidden",
            // Below lg: a sheet over the calendar instead of pushing it down.
            sheetOpen
              ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[85svh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-overlay"
              : "max-lg:hidden",
          )}
        >
          <div className="flex items-center gap-2 px-4 pt-3 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:rounded-t-xl max-lg:bg-card max-lg:pb-2">
            <span className="font-semibold text-[15px]">{t("title")}</span>
            <span className="tabular ml-auto text-muted-foreground text-small" aria-live="polite">
              {pending ? t("updating") : t("visible", { count: visibleCount })}
            </span>
            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                buttonRef.current?.focus();
              }}
              aria-label={t("close")}
              className="-mr-2 grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <form
            ref={formRef}
            method="get"
            action="/kalender"
            onChange={() => apply(fromForm(), hiddenFromForm())}
            onSubmit={(e) => {
              e.preventDefault();
              apply(fromForm(), hiddenFromForm());
            }}
            className="flex flex-col gap-4 px-4 py-4"
          >
            {Object.entries(keep).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <input type="hidden" name="ebenen" value="1" />

            {!eventsOnly && (
              <FilterGroup label={t("presets")}>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={preset === p.key}
                      onClick={() => applyPreset(p.key)}
                      className="min-h-7 whitespace-nowrap rounded-full border border-input bg-card px-3 font-medium text-small hover:bg-hover aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                    >
                      {t(`preset.${p.key}`)}
                    </button>
                  ))}
                </div>
              </FilterGroup>
            )}

            <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
              <legend className="mb-1 p-0 font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
                {t("events")}
              </legend>
              {typeKeys.map((key) => (
                <LayerCheck
                  key={key}
                  name="typ"
                  value={key}
                  checked={layers.types.includes(key)}
                  count={counts[key] ?? 0}
                  swatch={<EventTypeSquare typeKey={key} />}
                  label={t(`types.${key as EventTypeKey}`)}
                />
              ))}
            </fieldset>

            {(eventsOnly ? [] : (["deadlines", "team"] as const)).map((group) => {
              const keys = DEADLINE_GROUPS[group].filter((k) => available.includes(k));
              if (keys.length === 0) return null;
              return (
                <fieldset key={group} className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
                  <legend className="mb-1 p-0 font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
                    {t(group)}
                  </legend>
                  {keys.map((key) => {
                    const Icon = LAYER_ICONS[key];
                    return (
                      <LayerCheck
                        key={key}
                        name="frist"
                        value={key}
                        checked={layers.deadlines.includes(key)}
                        count={deadlineCounts[key] ?? 0}
                        swatch={
                          <Icon aria-hidden className="size-3.5 shrink-0 text-foreground-2" />
                        }
                        label={t(`deadline.${key}`)}
                      />
                    );
                  })}
                </fieldset>
              );
            })}

            {markets.length > 0 && (
              <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
                <legend className="mb-1 p-0 font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
                  {t("markets")}
                </legend>
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {markets.map((market) => (
                    <LayerCheck
                      key={market.key}
                      name="markt"
                      value={market.key}
                      checked={!market.hidden}
                      count={market.count}
                      swatch={
                        <span className="flex w-9 shrink-0 items-center gap-1">
                          <MarketMarker
                            color={market.color}
                            typeKey={market.typeKey}
                            shape="dot"
                            className="size-2.5 shrink-0"
                          />
                          {market.code && (
                            <span className="font-semibold text-[11px] tracking-wide">
                              {market.code}
                            </span>
                          )}
                        </span>
                      }
                      label={market.name}
                    />
                  ))}
                </div>
                <p className="m-0 px-1 text-muted-foreground text-tiny">{t("marketsHint")}</p>
              </fieldset>
            )}

            <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
              <legend className="mb-1 p-0 font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
                {t("background")}
              </legend>
              <LayerCheck
                name="feiertage"
                value="1"
                checked={layers.holidays}
                count={holidayCount}
                swatch={
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[2px] bg-status-critical-dot"
                  />
                }
                label={t("holidays")}
              />
            </fieldset>

            <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 border-border-subtle border-t p-0 pt-4">
              <legend className="float-left mb-1 w-full p-0 font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
                {t("narrow")}
              </legend>
              <LayerCheck
                name="kritisch"
                value="1"
                checked={layers.critical}
                label={t("critical")}
              />
              {canMine && (
                <LayerCheck name="meine" value="1" checked={layers.mine} label={t("mine")} />
              )}
              <label className="mt-2 flex flex-col gap-1 text-small">
                <span className="font-medium">{t("venue")}</span>
                <select
                  name="ort"
                  defaultValue={layers.venue ?? ""}
                  key={layers.venue ?? "all"}
                  className="min-h-(--control-h) rounded-lg border border-input bg-card px-3 py-1"
                >
                  <option value="">{t("allVenues")}</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <p className="m-0 text-muted-foreground text-tiny">{t("saved")}</p>
            <noscript>
              <button
                type="submit"
                className="min-h-8 rounded-lg border border-input bg-card px-3 font-medium"
              >
                {t("apply")}
              </button>
            </noscript>
          </form>
        </aside>
        <div
          aria-busy={pending}
          className={cn(
            "flex min-w-0 flex-col gap-3 transition-opacity",
            pending && "pointer-events-none opacity-60",
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}

function LayerCheck({
  name,
  value,
  checked,
  count,
  swatch,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  count?: number;
  swatch?: React.ReactNode;
  label: string;
}) {
  return (
    <label className="flex min-h-8 items-center gap-2 rounded-md px-1 text-small hover:bg-hover">
      <input
        type="checkbox"
        name={name}
        value={value}
        // Remount when the URL changes so the box follows the selection (e.g. after a preset).
        key={`${checked}`}
        defaultChecked={checked}
        className="size-4 shrink-0 accent-primary"
      />
      {swatch}
      <span className="min-w-0 flex-1">{label}</span>
      {/* Counted whether the layer is on or off (UX-051), so an off layer does not read as empty. */}
      {count !== undefined && (
        <span
          className={cn(
            "tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2",
            !checked && "opacity-70",
          )}
        >
          {count}
        </span>
      )}
    </label>
  );
}
