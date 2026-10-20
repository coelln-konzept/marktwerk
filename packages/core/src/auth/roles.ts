/**
 * Internal staff roles. Single company, so there is no organization scope.
 * See docs/product/roles-and-personas.md.
 */
export const ROLES = ["owner", "manager", "staff", "field"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
