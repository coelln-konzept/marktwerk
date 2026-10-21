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
