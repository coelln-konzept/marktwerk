"use server";

import { user, userPreference } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { db } from "@/server/db";
import { DENSITY_COOKIE, isDensity, isTheme, THEME_COOKIE } from "@/server/preferences";
import { requireUser } from "@/server/session";

const COOKIE = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" } as const;

export async function setLocale(locale: string) {
  const current = await requireUser();
  if (!isLocale(locale)) return;
  await db.update(user).set({ locale }).where(eq(user.id, current.id));
  (await cookies()).set(LOCALE_COOKIE, locale, COOKIE);
  revalidatePath("/", "layout");
}

/** Theme and density are preferences: stored per user, mirrored to cookies, no audit log (ADR 0019). */
export async function setDisplayPreference(input: { theme?: string; density?: string }) {
  const current = await requireUser();
  const patch: { theme?: "system" | "light" | "dark"; density?: "standard" | "compact" } = {};
  if (isTheme(input.theme)) patch.theme = input.theme;
  if (isDensity(input.density)) patch.density = input.density;
  if (!patch.theme && !patch.density) return;
  await db
    .insert(userPreference)
    .values({ userId: current.id, ...patch })
    .onConflictDoUpdate({ target: userPreference.userId, set: patch });
  const jar = await cookies();
  if (patch.theme) jar.set(THEME_COOKIE, patch.theme, COOKIE);
  if (patch.density) jar.set(DENSITY_COOKIE, patch.density, COOKIE);
  revalidatePath("/", "layout");
}
