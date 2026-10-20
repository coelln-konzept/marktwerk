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
  market: ["read", "write", "delete"],
  template: ["read", "write", "delete"],
  task: ["read", "write", "assign", "delete"],
  permit: ["read", "write", "delete"],
  contact: ["read", "write", "delete"],
  kb: ["read", "write", "delete"],
  audit: ["read"],
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
    market: ["read"],
    template: ["read"],
    task: ["read", "write", "assign"],
    permit: ["read", "write"],
    contact: ["read", "write"],
    kb: ["read", "write"],
  },
  // Field crew: market-day app only. Row-level scoping to rostered markets
  // happens in the query layer, not here.
  field: {
    market: ["read"],
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
