import { EVENT_TYPE_KEYS } from "@/components/ui/event-type-tag";

/**
 * Layer selection of the Kalender ("Ebenen"). It lives in the URL (GET form) and is saved per
 * person in `user_preference.saved_views.kalender`. Shared by the server page, the server action
 * and the client panel, so this file must stay free of server-only imports.
 */
export type Layers = {
  /** Event type keys shown (layer group VERANSTALTUNGEN). */
  types: string[];
  /** Feiertage NRW (layer group HINTERGRUND). */
  holidays: boolean;
  /** Narrowing: only events with health Achtung or Kritisch. */
  critical: boolean;
  /** Narrowing: only events the signed-in person has a duty at. */
  mine: boolean;
  /** Narrowing: one venue (uuid) or null for all. */
  venue: string | null;
};

export const DEFAULT_LAYERS: Layers = {
  types: [...EVENT_TYPE_KEYS],
  holidays: true,
  critical: false,
  mine: false,
  venue: null,
};

/** Presets set the layer groups and keep the narrowing as it is. */
export const PRESETS = [
  { key: "all", types: [...EVENT_TYPE_KEYS], holidays: true },
  { key: "events", types: [...EVENT_TYPE_KEYS], holidays: false },
  { key: "deadlines", types: [], holidays: true },
  { key: "markets", types: ["flea", "antique"], holidays: true },
] as const satisfies { key: string; types: readonly string[]; holidays: boolean }[];

export type PresetKey = (typeof PRESETS)[number]["key"];

/** Layers of later milestones: shown disabled so people see what is coming. */
export const FUTURE_LAYERS = {
  deadlines: [
    { key: "permits", milestone: "M3" },
    { key: "payments", milestone: "M5" },
    { key: "tasks", milestone: "M2" },
    { key: "hours", milestone: "M4" },
    { key: "returns", milestone: "M12" },
    { key: "vehicles", milestone: "M6" },
  ],
  team: [{ key: "shifts", milestone: "M4" }],
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates untrusted input (URL or saved JSON) into a Layers value. */
export function sanitizeLayers(raw: unknown): Layers {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const types = Array.isArray(o.types)
    ? EVENT_TYPE_KEYS.filter((k) => (o.types as unknown[]).includes(k))
    : [...DEFAULT_LAYERS.types];
  return {
    types,
    holidays: typeof o.holidays === "boolean" ? o.holidays : DEFAULT_LAYERS.holidays,
    critical: o.critical === true,
    mine: o.mine === true,
    venue: typeof o.venue === "string" && UUID.test(o.venue) ? o.venue : null,
  };
}

type Params = Record<string, string | string[] | undefined>;

/** Layers from the URL, or null when the URL carries no explicit layer selection. */
export function parseLayers(sp: Params): Layers | null {
  if (sp.ebenen !== "1") return null;
  const typ = ([] as (string | undefined)[]).concat(sp.typ).flatMap((v) => (v ?? "").split(","));
  const ort = typeof sp.ort === "string" ? sp.ort : null;
  return sanitizeLayers({
    types: typ.filter(Boolean),
    holidays: sp.feiertage === "1",
    critical: sp.kritisch === "1",
    mine: sp.meine === "1",
    venue: ort,
  });
}

/** URL params for a selection (merged into the current search params by the caller). */
export function layerParams(layers: Layers): Record<string, string | undefined> {
  return {
    ebenen: "1",
    typ: layers.types.join(",") || undefined,
    feiertage: layers.holidays ? "1" : undefined,
    kritisch: layers.critical ? "1" : undefined,
    meine: layers.mine ? "1" : undefined,
    ort: layers.venue ?? undefined,
  };
}

export function activePreset(layers: Layers): PresetKey | null {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((k) => b.includes(k));
  return (
    PRESETS.find((p) => p.holidays === layers.holidays && same(p.types, layers.types))?.key ?? null
  );
}
