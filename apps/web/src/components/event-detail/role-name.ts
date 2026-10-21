/** Duty role name in the current locale. */
export function roleName(role: { roleDe: string; roleEn: string }, locale: string): string {
  return locale === "en" ? role.roleEn : role.roleDe;
}
