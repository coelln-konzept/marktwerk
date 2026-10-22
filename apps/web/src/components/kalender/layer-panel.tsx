"use client";

import { ChevronDown, Layers as LayersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { saveKalenderLayers } from "@/app/(app)/kalender/actions";
import { type EventTypeKey, EventTypeSquare } from "@/components/ui/event-type-tag";
import { FilterGroup } from "@/components/ui/filter-bar";
import { UI_STATE_COOKIES, writeUiState } from "@/lib/ui-state";
import { cn } from "@/lib/utils";
import type { CalendarLayer } from "@/server/queries/due";
import { LAYER_ICONS } from "./deadline-chip";
import {
  activePreset,
  DEADLINE_GROUPS,
  type Layers,
  layerParams,
  PRESETS,
  type PresetKey,
} from "./layers";

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
};

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
}: Props) {
  const t = useTranslations("kalenderPage.layers");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const preset = activePreset(layers, available);

  function toggle() {
    const next = !open;
    setOpen(next);
    writeUiState(UI_STATE_COOKIES.calendarLayers, next);
  }

  function apply(next: Layers) {
    const params = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(layerParams(next))) if (v !== undefined) params.set(k, v);
    void saveKalenderLayers(next).catch(() => {});
    startTransition(() => router.replace(`/kalender?${params}` as never, { scroll: false }));
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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {toolbar}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="kalender-layers"
          className="ml-auto inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover aria-expanded:bg-hover"
        >
          <LayersIcon aria-hidden className="size-4" />
          {t("title")}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      <div className={cn("grid items-start gap-4", open && "lg:grid-cols-[260px_minmax(0,1fr)]")}>
        <aside
          id="kalender-layers"
          aria-label={t("title")}
          aria-busy={pending}
          className={cn(
            "self-start rounded-xl border bg-card lg:sticky lg:top-4",
            open ? "block" : "hidden",
          )}
        >
          <div className="flex items-center gap-2 px-4 pt-3">
            <span className="font-semibold text-[15px]">{t("title")}</span>
            <span className="tabular ml-auto text-muted-foreground text-small">
              {t("visible", { count: visibleCount })}
            </span>
          </div>
          <form
            ref={formRef}
            method="get"
            action="/kalender"
            onChange={() => apply(fromForm())}
            onSubmit={(e) => {
              e.preventDefault();
              apply(fromForm());
            }}
            className="flex flex-col gap-4 px-4 py-4"
          >
            {Object.entries(keep).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <input type="hidden" name="ebenen" value="1" />

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

            {(["deadlines", "team"] as const).map((group) => {
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
        <div className="flex min-w-0 flex-col gap-3">{children}</div>
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
      {count !== undefined && (
        <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2">
          {count}
        </span>
      )}
    </label>
  );
}
