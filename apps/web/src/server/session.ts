import "server-only";
import { type Action, can, isRole, type Resource, type Role } from "@marktwerk/core";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: string;
};

/** The signed-in user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result || result.user.banned) return null;
  const { id, name, email, role, locale } = result.user;
  return { id, name, email, role: isRole(role) ? role : "staff", locale: locale ?? "de" };
});

/** Use at the top of every protected page, server action and route handler. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission<R extends Resource>(
  resource: R,
  action: Action<R>,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, resource, action)) forbidden();
  return user;
}
