import { can, type Role } from "@marktwerk/core";
import { EVENT_TYPE_KEYS } from "@/components/ui/event-type-tag";
import type { ModuleHide } from "@/lib/modules";
import { CALENDAR_LAYERS, type CalendarLayer } from "@/server/queries/due";

/**
 * Layer selection of the Kalender ("Ebenen"). It lives in the URL (GET form) and is saved per
 * person in `user_preference.saved_views.kalender`. Shared by the server page, the server action
 * and the client panel, so this file must stay free of server-only imports.
 */
export type Layers = {
  /** Event type keys shown (layer group VERANSTALTUNGEN). */
  types: string[];
  /** Module layers shown (groups FRISTEN and TEAM): tasks, permits, installments, obligations, shifts. */
  deadlines: CalendarLayer[];
  /** Feiertage NRW (layer group HINTERGRUND). */
  holidays: boolean;
  /** Narrowing: only events (and deadlines) with health Achtung or Kritisch. */
  critical: boolean;
  /** Narrowing: only events the signed-in person has a duty at, and only their own tasks. */
  mine: boolean;
  /** Narrowing: one venue (uuid) or null for all. */
  venue: string | null;
};

/**
 * What the Kalender shows until someone changes it (UX pass 2026-10-22): the markets and the deadlines
 * around them (permits, instalments, obligations, shifts), not every single task: those are on the
 * Board. This equals the preset "Märkte + Fristen".
 */
export const DEFAULT_LAYERS: Layers = {
  types: [...EVENT_TYPE_KEYS],
  deadlines: CALENDAR_LAYERS.filter((l) => l !== "tasks"),
  holidays: true,
  critical: false,
  mine: false,
  venue: null,
};

/** Two presets (set the layer groups, keep the narrowing as it is): only the markets, or markets + deadlines. */
export const PRESETS = [
  { key: "markets", types: [...EVENT_TYPE_KEYS], deadlines: [], holidays: false },
  {
    key: "marketsDeadlines",
    types: [...EVENT_TYPE_KEYS],
    deadlines: CALENDAR_LAYERS.filter((l) => l !== "tasks"),
    holidays: true,
  },
] as const satisfies {
  key: string;
  types: readonly string[];
  deadlines: readonly CalendarLayer[];
  holidays: boolean;
}[];

export type PresetKey = (typeof PRESETS)[number]["key"];

/** Layer groups of the panel, in order. */
export const DEADLINE_GROUPS = {
  deadlines: ["permits", "installments", "tasks", "obligations"],
  team: ["shifts"],
} as const satisfies Record<string, readonly CalendarLayer[]>;

/**
 * The module layers a role may see (same checks as the modules' `calendarItems`): tasks for everyone,
 * permits `permit:read`, instalments `finance:read`, obligations `company:read`, shifts `team:read`
 * (field users see their own shifts when they have a staff record). `hide` drops the layers of modules
 * hidden in the UI (lib/modules.ts): instalments with finance, shifts with team.
 */
export function availableLayers(
  role: Role,
  hasStaffMember: boolean,
  hide: ModuleHide = {},
): CalendarLayer[] {
  const allowed: Record<CalendarLayer, boolean> = {
    tasks: can(role, "task", "read"),
    permits: can(role, "permit", "read"),
    installments: !hide.finance && can(role, "finance", "read"),
    obligations: can(role, "company", "read"),
    shifts: !hide.team && (can(role, "team", "read") || (role === "field" && hasStaffMember)),
  };
  return CALENDAR_LAYERS.filter((layer) => allowed[layer]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates untrusted input (URL or saved JSON) into a Layers value. */
export function sanitizeLayers(raw: unknown): Layers {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const types = Array.isArray(o.types)
    ? EVENT_TYPE_KEYS.filter((k) => (o.types as unknown[]).includes(k))
    : [...DEFAULT_LAYERS.types];
  // Selections saved before the module layers existed have no `deadlines`: the default set.
  const deadlines = Array.isArray(o.deadlines)
    ? CALENDAR_LAYERS.filter((k) => (o.deadlines as unknown[]).includes(k))
    : [...DEFAULT_LAYERS.deadlines];
  return {
    types,
    deadlines,
    holidays: typeof o.holidays === "boolean" ? o.holidays : DEFAULT_LAYERS.holidays,
    critical: o.critical === true,
    mine: o.mine === true,
    venue: typeof o.venue === "string" && UUID.test(o.venue) ? o.venue : null,
  };
}

type Params = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined) =>
  ([] as (string | undefined)[]).concat(value).flatMap((v) => (v ?? "").split(","));

/** Layers from the URL, or null when the URL carries no explicit layer selection. */
export function parseLayers(sp: Params): Layers | null {
  if (sp.ebenen !== "1") return null;
  const ort = typeof sp.ort === "string" ? sp.ort : null;
  return sanitizeLayers({
    types: list(sp.typ).filter(Boolean),
    deadlines: list(sp.frist).filter(Boolean),
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
    frist: layers.deadlines.join(",") || undefined,
    feiertage: layers.holidays ? "1" : undefined,
    kritisch: layers.critical ? "1" : undefined,
    meine: layers.mine ? "1" : undefined,
    ort: layers.venue ?? undefined,
  };
}

/**
 * The preset a selection equals. `available` limits the comparison to the module layers the person may
 * see, so a role without finance access still sees "Alles" highlighted when everything it can see is on.
 */
export function activePreset(
  layers: Layers,
  available: readonly CalendarLayer[] = CALENDAR_LAYERS,
): PresetKey | null {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((k) => b.includes(k));
  const mine = layers.deadlines.filter((l) => available.includes(l));
  return (
    PRESETS.find(
      (p) =>
        p.holidays === layers.holidays &&
        same(p.types, layers.types) &&
        same(
          p.deadlines.filter((l) => available.includes(l)),
          mine,
        ),
    )?.key ?? null
  );
}

/**
 * Cookie that remembers whether this browser last showed a phone-sized viewport ("1") or a wider one
 * ("0"). The Kalender opens in Liste on phones (decision 2026-10-28); the server cannot see the width,
 * so a small client component (`ViewDefault`) keeps this cookie in step and the page reads it.
 */
export const KAL_PHONE_COOKIE = "mw_kal_phone";

/**
 * How many layers differ from `DEFAULT_LAYERS` (every layer switched differently counts one, every
 * active narrowing counts one). Only layers the person can see are compared, so a role without
 * finance access never sees a change it cannot make.
 */
export function layersChangedCount(
  layers: Layers,
  available: readonly CalendarLayer[] = CALENDAR_LAYERS,
): number {
  let n = 0;
  for (const k of EVENT_TYPE_KEYS)
    if (layers.types.includes(k) !== DEFAULT_LAYERS.types.includes(k)) n++;
  for (const l of available)
    if (layers.deadlines.includes(l) !== DEFAULT_LAYERS.deadlines.includes(l)) n++;
  if (layers.holidays !== DEFAULT_LAYERS.holidays) n++;
  if (layers.critical) n++;
  if (layers.mine) n++;
  if (layers.venue) n++;
  return n;
}
