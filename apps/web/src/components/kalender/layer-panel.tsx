"use client";

import { Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { saveKalenderLayers } from "@/app/(app)/kalender/actions";
import { type EventTypeKey, EventTypeSquare } from "@/components/ui/event-type-tag";
import { cn } from "@/lib/utils";
import type { CalendarLayer } from "@/server/queries/due";
import { LAYER_ICONS } from "./deadline-chip";
import {
  activePreset,
  DEADLINE_GROUPS,
  FUTURE_LAYERS,
  type Layers,
  layerParams,
  PRESETS,
  type PresetKey,
} from "./layers";

type Props = {
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
  canMine: boolean;
  /** Search params to keep when layers change (ansicht, monat, ab). */
  keep: Record<string, string>;
};

/**
 * "Ebenen": a GET form whose state lives in the URL. Changing a layer navigates (and saves the
 * selection per person via a server action); without JavaScript the "Übernehmen" button submits
 * the same form.
 */
export function LayerPanel({
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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const preset = activePreset(layers, available);

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
      mine: data.has("meine"),
      venue: (data.get("ort") as string) || null,
    };
  }

  function applyPreset(key: PresetKey) {
    const p = PRESETS.find((x) => x.key === key);
    if (p)
      apply({ ...layers, types: [...p.types], deadlines: [...p.deadlines], holidays: p.holidays });
  }

  return (
    <aside
      aria-label={t("title")}
      aria-busy={pending}
      className="self-start rounded-xl border bg-card lg:sticky lg:top-4"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="kalender-layers"
        aria-label={t("toggle")}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left lg:pointer-events-none"
      >
        <Filter aria-hidden className="size-4" />
        <span className="font-semibold text-[15px]">{t("title")}</span>
        <span className="tabular ml-auto text-muted-foreground text-small">
          {t("visible", { count: visibleCount })}
        </span>
      </button>
      <form
        ref={formRef}
        id="kalender-layers"
        method="get"
        action="/kalender"
        onChange={() => apply(fromForm())}
        onSubmit={(e) => {
          e.preventDefault();
          apply(fromForm());
        }}
        className={cn(
          "flex-col gap-4 border-border-subtle border-t px-4 py-4 lg:flex",
          open ? "flex" : "hidden",
        )}
      >
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="ebenen" value="1" />

        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of preset buttons */}
        <div role="group" aria-label={t("presets")} className="flex flex-wrap gap-1.5">
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
          const future = group === "deadlines" ? FUTURE_LAYERS.deadlines : [];
          if (keys.length === 0 && future.length === 0) return null;
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
                    swatch={<Icon aria-hidden className="size-3.5 shrink-0 text-foreground-2" />}
                    label={t(`deadline.${key}`)}
                  />
                );
              })}
              {future.map((f) => (
                <LayerCheck
                  key={f.key}
                  disabled
                  label={t(`future.${f.key}`)}
                  hint={t("comesWith", { milestone: f.milestone })}
                />
              ))}
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
          <LayerCheck name="kritisch" value="1" checked={layers.critical} label={t("critical")} />
          <LayerCheck
            name="meine"
            value="1"
            checked={layers.mine}
            disabled={!canMine}
            hint={canMine ? undefined : t("mineNone")}
            label={t("mine")}
          />
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

        <p className="m-0 text-muted-foreground text-tiny">{t("narrowHint")}</p>
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
  );
}

function LayerCheck({
  name,
  value,
  checked,
  disabled,
  count,
  swatch,
  label,
  hint,
}: {
  name?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  count?: number;
  swatch?: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-md px-1 text-small hover:bg-hover",
        disabled && "cursor-not-allowed text-muted-foreground hover:bg-transparent",
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        // Remount when the URL changes so the box follows the selection (e.g. after a preset).
        key={`${checked}`}
        defaultChecked={checked}
        disabled={disabled}
        className="size-4 shrink-0 accent-primary"
      />
      {swatch}
      <span className="min-w-0 flex-1">
        {label}
        {hint && <span className="block text-muted-foreground text-tiny">{hint}</span>}
      </span>
      {count !== undefined && (
        <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2">
          {count}
        </span>
      )}
    </label>
  );
}
