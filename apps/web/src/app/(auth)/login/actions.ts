"use server";

import { userPreference } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { DENSITY_COOKIE, THEME_COOKIE } from "@/server/preferences";
import { requireUser } from "@/server/session";

/** After signing in on a new device: restore the theme and density cookies from the user's preferences. */
export async function restoreDisplayPreferences() {
  const user = await requireUser();
  const pref = await db.query.userPreference.findFirst({ where: eq(userPreference.userId, user.id) });
  if (!pref) return;
  const jar = await cookies();
  const options = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" } as const;
  jar.set(THEME_COOKIE, pref.theme, options);
  jar.set(DENSITY_COOKIE, pref.density, options);
}
