"use server";

import { user } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

export async function setLocale(locale: string) {
  const current = await requireUser();
  if (!isLocale(locale)) return;
  await db.update(user).set({ locale }).where(eq(user.id, current.id));
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
