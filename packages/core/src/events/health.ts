/**
 * Event health ("Zustand"): Im Plan ● · Achtung ▲ · Kritisch ■ · noch offen ○ (UX concept §7).
 * Each dimension (permits, tasks, team, money) reports its own level once its module exists;
 * `null` means "not tracked yet" and never makes an event look healthy or unhealthy.
 */
export type HealthLevel = "ok" | "warn" | "critical";

export type HealthDimensions = {
  permits: HealthLevel | null;
  tasks: HealthLevel | null;
  team: HealthLevel | null;
  money: HealthLevel | null;
};

const RANK: Record<HealthLevel, number> = { ok: 0, warn: 1, critical: 2 };

/** Overall health = the worst tracked dimension; null if nothing is tracked. */
export function overallHealth(dimensions: HealthDimensions): HealthLevel | null {
  let worst: HealthLevel | null = null;
  for (const level of Object.values(dimensions)) {
    if (level && (worst === null || RANK[level] > RANK[worst])) worst = level;
  }
  return worst;
}

/** Team dimension in M1: are all duty roles staffed? (Shift coverage joins in M4.) */
export function teamHealth(assignedRoles: number, requiredRoles: number): HealthLevel | null {
  if (requiredRoles <= 0) return null;
  if (assignedRoles >= requiredRoles) return "ok";
  return assignedRoles === 0 ? "critical" : "warn";
}

/** Number of dimensions at warn or critical, shown as "Achtung · 3". */
export function issueCount(dimensions: HealthDimensions): number {
  return Object.values(dimensions).filter((l) => l === "warn" || l === "critical").length;
}

// ---------------------------------------------------------------------------------------------
// Reasons: say what is wrong instead of "Achtung" / "Kritisch" (UX pass 2026-10-22)

export type HealthReasonKey =
  | "ok"
  | "permits"
  | "permitsEnding"
  | "tasksOverdue"
  | "tasksBlocked"
  | "tasksRollover";

/** A reason to show instead of the level word; `count` feeds the plural message. */
export type HealthReason = { key: HealthReasonKey; count?: number };

/**
 * Why the permit dimension has its level: "1 Genehmigung fehlt" when required permits are not held for
 * the event, "Läuft vor Ende ab" when everything is held but a permit ends within a multi-day event, "Im
 * Plan" when all is fine. Null when nothing is tracked.
 */
export function permitsReason(level: HealthLevel | null, missing: number): HealthReason | null {
  if (level === null) return null;
  if (level === "ok") return { key: "ok" };
  return missing > 0 ? { key: "permits", count: missing } : { key: "permitsEnding" };
}

/**
 * Why the task dimension has its level: "5 überfällig" first, then "2 blockiert", then "oft verschoben"
 * (the only other way to be critical), "Im Plan" when all is fine. Null when nothing is tracked.
 */
export function tasksReason(
  level: HealthLevel | null,
  overdue: number,
  blocked: number,
): HealthReason | null {
  if (level === null) return null;
  if (level === "ok") return { key: "ok" };
  if (overdue > 0) return { key: "tasksOverdue", count: overdue };
  if (blocked > 0) return { key: "tasksBlocked", count: blocked };
  return { key: "tasksRollover" };
}
