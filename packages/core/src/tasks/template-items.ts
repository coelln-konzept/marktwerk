import { clockTime, type DayMode, MAX_OFFSET_DAYS } from "./due";

export const TASK_PHASES = ["pre", "live", "post"] as const;
export type TaskPhase = (typeof TASK_PHASES)[number];

export const TASK_CATEGORIES = [
  "general",
  "permits",
  "logistics",
  "communication",
  "finance",
  "staff",
  "office",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DAY_MODES = ["calendar", "business"] as const;

/** Named event dates a template item can hang on (more can exist: custom anchors, permit decision). */
export const STANDARD_ANCHOR_KEYS = [
  "event_day",
  "setup_day",
  "teardown_day",
  "booking_cutoff",
  "permit_decision",
] as const;

export const TEMPLATE_TITLE_MAX = 200;
export const TEMPLATE_TEXT_MAX = 5000;
export const MAX_CHECK_ITEMS = 30;
export const MAX_ESTIMATE_MINUTES = 100_000;
export const MAX_ITEMS_PER_VERSION = 300;

/** When an item applies; every list that is given must match (any entry within a list). */
export type ItemCondition = {
  eventTypeKeys?: string[];
  venueIds?: string[];
  venueKinds?: string[];
};

/** What the conditions look at. */
export type ConditionFacts = { eventTypeKey: string; venueId: string; venueKind: string | null };

/** True if the condition is empty/absent or every given list contains the event's value. */
export function itemApplies(
  condition: ItemCondition | null | undefined,
  facts: ConditionFacts,
): boolean {
  if (!condition) return true;
  const { eventTypeKeys, venueIds, venueKinds } = condition;
  if (eventTypeKeys && eventTypeKeys.length > 0 && !eventTypeKeys.includes(facts.eventTypeKey))
    return false;
  if (venueIds && venueIds.length > 0 && !venueIds.includes(facts.venueId)) return false;
  if (
    venueKinds &&
    venueKinds.length > 0 &&
    !(facts.venueKind && venueKinds.includes(facts.venueKind))
  )
    return false;
  return true;
}

/** The items that apply to an event, in their order. */
export function applicableItems<T extends { condition?: ItemCondition | null }>(
  items: readonly T[],
  facts: ConditionFacts,
): T[] {
  return items.filter((item) => itemApplies(item.condition, facts));
}

/** True if the condition restricts anything. */
export function hasCondition(condition: ItemCondition | null | undefined): boolean {
  return Boolean(
    condition &&
      ((condition.eventTypeKeys?.length ?? 0) > 0 ||
        (condition.venueIds?.length ?? 0) > 0 ||
        (condition.venueKinds?.length ?? 0) > 0),
  );
}

/** Drops empty lists; null if nothing is left (stored as null). */
export function normalizeCondition(
  condition: ItemCondition | null | undefined,
): ItemCondition | null {
  if (!condition) return null;
  const clean = (list: string[] | undefined) => [
    ...new Set((list ?? []).map((v) => String(v).trim()).filter(Boolean)),
  ];
  const result: ItemCondition = {};
  const eventTypeKeys = clean(condition.eventTypeKeys);
  const venueIds = clean(condition.venueIds);
  const venueKinds = clean(condition.venueKinds);
  if (eventTypeKeys.length > 0) result.eventTypeKeys = eventTypeKeys;
  if (venueIds.length > 0) result.venueIds = venueIds;
  if (venueKinds.length > 0) result.venueKinds = venueKinds;
  return hasCondition(result) ? result : null;
}

/** What the editor and the services pass around for one item. */
export type TemplateItemFields = {
  title: string;
  description: string | null;
  phase: TaskPhase;
  category: TaskCategory;
  anchorKey: string;
  offsetDays: number;
  dayMode: DayMode;
  /** "HH:MM" or null (company default time) */
  dueTime: string | null;
  dutyRoleId: string | null;
  priority: TaskPriority;
  estimateMinutes: number;
  requiresPhoto: boolean;
  requiresNote: boolean;
  requiresAttachment: boolean;
  /** Kernaufgabe: a task every market needs (manual flag, copied to the task). */
  isKey: boolean;
  checkItems: string[];
  approverDutyRoleId: string | null;
  dependsOnKeys: string[];
  condition: ItemCondition | null;
};

export type ItemIssueCode =
  | "invalid_title"
  | "invalid_description"
  | "invalid_phase"
  | "invalid_category"
  | "invalid_priority"
  | "invalid_day_mode"
  | "invalid_anchor"
  | "invalid_offset"
  | "invalid_time"
  | "invalid_estimate"
  | "invalid_check_items"
  | "invalid_depends"
  | "invalid_condition";

export type ItemIssueField =
  | "title"
  | "description"
  | "phase"
  | "category"
  | "priority"
  | "dayMode"
  | "anchorKey"
  | "offsetDays"
  | "dueTime"
  | "estimateMinutes"
  | "checkItems"
  | "dependsOnKeys"
  | "condition";

export type ItemIssue = { code: ItemIssueCode; field: ItemIssueField };

const ANCHOR_KEY = /^[a-z][a-z0-9_]{0,39}$/;

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** Field checks of one item (pure; references such as duty roles are checked by the service). */
export function checkTemplateItem(item: TemplateItemFields): ItemIssue[] {
  const issues: ItemIssue[] = [];
  const add = (code: ItemIssueCode, field: ItemIssueField) => issues.push({ code, field });
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (title === "" || title.length > TEMPLATE_TITLE_MAX) add("invalid_title", "title");
  if (
    item.description !== null &&
    (typeof item.description !== "string" || item.description.length > TEMPLATE_TEXT_MAX)
  )
    add("invalid_description", "description");
  if (!isOneOf(TASK_PHASES, item.phase)) add("invalid_phase", "phase");
  if (!isOneOf(TASK_CATEGORIES, item.category)) add("invalid_category", "category");
  if (!isOneOf(TASK_PRIORITIES, item.priority)) add("invalid_priority", "priority");
  if (!isOneOf(DAY_MODES, item.dayMode)) add("invalid_day_mode", "dayMode");
  if (typeof item.anchorKey !== "string" || !ANCHOR_KEY.test(item.anchorKey))
    add("invalid_anchor", "anchorKey");
  if (
    !Number.isInteger(item.offsetDays) ||
    item.offsetDays < -MAX_OFFSET_DAYS ||
    item.offsetDays > MAX_OFFSET_DAYS
  )
    add("invalid_offset", "offsetDays");
  if (item.dueTime !== null && clockTime(item.dueTime) === null) add("invalid_time", "dueTime");
  if (
    !Number.isInteger(item.estimateMinutes) ||
    item.estimateMinutes < 0 ||
    item.estimateMinutes > MAX_ESTIMATE_MINUTES
  )
    add("invalid_estimate", "estimateMinutes");
  if (
    !Array.isArray(item.checkItems) ||
    item.checkItems.length > MAX_CHECK_ITEMS ||
    item.checkItems.some(
      (c) => typeof c !== "string" || c.trim() === "" || c.length > TEMPLATE_TITLE_MAX,
    )
  )
    add("invalid_check_items", "checkItems");
  if (!Array.isArray(item.dependsOnKeys) || item.dependsOnKeys.some((k) => typeof k !== "string"))
    add("invalid_depends", "dependsOnKeys");
  const c = item.condition;
  if (
    c !== null &&
    (typeof c !== "object" ||
      [c.eventTypeKeys, c.venueIds, c.venueKinds].some(
        (list) =>
          list !== undefined && (!Array.isArray(list) || list.some((v) => typeof v !== "string")),
      ))
  )
    add("invalid_condition", "condition");
  return issues;
}

export type DependencyIssue = {
  key: string;
  code: "unknown_dependency" | "self_dependency" | "dependency_cycle";
};

/**
 * Dependencies must point at other items of the same version and must not form a loop. Dependencies are
 * informational (they never move dates), but a loop would make "waits for" unanswerable.
 */
export function checkDependencies(
  items: readonly { stableKey: string; dependsOnKeys: readonly string[] }[],
): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  const known = new Map(items.map((i) => [i.stableKey, i.dependsOnKeys]));
  for (const item of items) {
    for (const dep of item.dependsOnKeys) {
      if (dep === item.stableKey) issues.push({ key: item.stableKey, code: "self_dependency" });
      else if (!known.has(dep)) issues.push({ key: item.stableKey, code: "unknown_dependency" });
    }
  }
  // Depth-first search for loops (white/grey/black colouring).
  const state = new Map<string, 1 | 2>();
  const reported = new Set<string>();
  const visit = (key: string, path: string[]) => {
    state.set(key, 1);
    for (const dep of known.get(key) ?? []) {
      if (dep === key || !known.has(dep)) continue;
      if (state.get(dep) === 1) {
        for (const member of path.slice(path.indexOf(dep))) reported.add(member);
        reported.add(dep);
      } else if (!state.has(dep)) visit(dep, [...path, dep]);
    }
    state.set(key, 2);
  };
  for (const item of items) if (!state.has(item.stableKey)) visit(item.stableKey, [item.stableKey]);
  for (const key of reported) issues.push({ key, code: "dependency_cycle" });
  return issues;
}

/**
 * Basis of an item's `stable_key` from its title ("Marktgenehmigung beantragen" →
 * "marktgenehmigung_beantragen"), at most 50 characters. The key identifies the item across versions.
 */
export function itemKeyBase(title: string): string {
  const slug = title
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50)
    .replace(/_+$/, "");
  return slug || "aufgabe";
}

/** A key not in `taken`: the base, then base_2, base_3, … */
export function uniqueItemKey(title: string, taken: ReadonlySet<string>): string {
  const base = itemKeyBase(title);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** "T-30" / "T" / "T+2" for an offset (matches `formatOffset` in dates/relative). */
export function offsetLabel(offsetDays: number): string {
  if (offsetDays === 0) return "T";
  return offsetDays < 0 ? `T${offsetDays}` : `T+${offsetDays}`;
}

/**
 * Position of an offset on the timeline ruler, 0 (left) … 1 (right). Linear within ±30 days around the
 * anchor (60 % of the width) and compressed beyond, so T-180 still fits ("Maßstab wechselt ab T-30").
 */
export function rulerPosition(offsetDays: number, min: number, max: number): number {
  const near = 30;
  const compress = (days: number) => {
    const sign = days < 0 ? -1 : 1;
    const abs = Math.abs(days);
    return abs <= near ? days : sign * (near + Math.log1p((abs - near) / near) * near);
  };
  const lo = compress(Math.min(min, -near));
  const hi = compress(Math.max(max, near));
  return (compress(offsetDays) - lo) / (hi - lo);
}
