"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  type CompanyField,
  type CompanySettingsInput,
  type SettingsFieldError,
  SettingsInputError,
  updateCompanySettings,
} from "@/server/services/settings";
import {
  banUser,
  changeUserRole,
  linkStaffMember,
  UserInputError,
  unbanUser,
} from "@/server/services/users";
import { requirePermission } from "@/server/session";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Partial<Record<CompanyField, SettingsFieldError>> };

/** Company data (owner only, `settings:manage`). Field errors come back per field. */
export async function saveCompanySettings(
  input: CompanySettingsInput,
): Promise<ActionResult<{ changed: boolean }>> {
  await requirePermission("settings", "manage");
  const actor = await getActor();
  try {
    const data = await updateCompanySettings(actor, input);
    refresh();
    return { ok: true, data: { changed: data.changed } };
  } catch (error) {
    if (error instanceof SettingsInputError)
      return { ok: false, error: "invalid_fields", fields: error.fields };
    throw error;
  }
}

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof UserInputError) {
      // The page may show outdated data (e.g. someone else changed the same login); make it current.
      refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function setUserRole(userId: string, role: string) {
  await requirePermission("user", "manage");
  const actor = await getActor();
  return run(() => changeUserRole(actor, userId, role));
}

export async function deactivateUser(userId: string) {
  await requirePermission("user", "manage");
  const actor = await getActor();
  return run(() => banUser(actor, userId));
}

export async function reactivateUser(userId: string) {
  await requirePermission("user", "manage");
  const actor = await getActor();
  return run(() => unbanUser(actor, userId));
}

export async function setUserStaffLink(userId: string, staffMemberId: string | null) {
  await requirePermission("user", "manage");
  const actor = await getActor();
  return run(() => linkStaffMember(actor, userId, staffMemberId));
}
