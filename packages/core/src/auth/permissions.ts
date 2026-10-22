import type { Role } from "./roles";

/**
 * Central permission matrix. Every server action / route handler checks
 * permissions through `can()`; the UI may use it to hide controls, but never
 * relies on that alone.
 *
 * Resources map to modules; actions are deliberately coarse. Extend this
 * table instead of sprinkling role checks across the codebase.
 */
export const PERMISSIONS = {
  user: ["read", "manage"],
  settings: ["read", "manage"],
  venue: ["read", "write", "delete"],
  event: ["read", "write", "delete"],
  template: ["read", "write", "delete"],
  task: ["read", "write", "assign", "delete"],
  permit: ["read", "write", "delete"],
  contact: ["read", "write", "delete"],
  /** Staff members, contracts, shifts, hours and payroll export. */
  team: ["read", "manage"],
  /** Payables, instalments, receipts, event budgets. */
  finance: ["read", "write"],
  /** Company tab: obligations, vehicles, insurances. */
  company: ["read", "write"],
  /** Vendor records (imported read-only in Phase 1, bookings in Phase 2). */
  vendor: ["read", "write"],
  kb: ["read", "write", "delete"],
  audit: ["read"],
  /** The company-wide notification center (owner and manager); everybody has their personal inbox. */
  notification: ["read", "manage"],
} as const;

export type Resource = keyof typeof PERMISSIONS;
export type Action<R extends Resource> = (typeof PERMISSIONS)[R][number];

type Grants = { [R in Resource]?: readonly Action<R>[] | "*" };

const ALL: Grants = Object.fromEntries(
  Object.keys(PERMISSIONS).map((resource) => [resource, "*"]),
) as Grants;

const GRANTS: Record<Role, Grants> = {
  owner: ALL,
  manager: {
    ...ALL,
    user: ["read"],
    settings: ["read"],
  },
  staff: {
    user: ["read"],
    settings: ["read"],
    venue: ["read"],
    event: ["read"],
    template: ["read"],
    task: ["read", "write", "assign"],
    permit: ["read", "write"],
    contact: ["read", "write"],
    company: ["read"],
    vendor: ["read", "write"],
    kb: ["read", "write"],
  },
  // Field users: only events they work at (shift or duty). That row-level
  // scoping happens in the query layer, not here (decision 2026-10-21).
  field: {
    event: ["read"],
    task: ["read", "write"],
    kb: ["read"],
  },
};

export function can<R extends Resource>(
  role: Role | null | undefined,
  resource: R,
  action: Action<R>,
): boolean {
  if (!role) return false;
  const grant = GRANTS[role][resource] as readonly string[] | "*" | undefined;
  if (!grant) return false;
  return grant === "*" || grant.includes(action);
}
