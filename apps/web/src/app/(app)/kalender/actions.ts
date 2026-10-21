"use server";

import { userPreference } from "@marktwerk/db/schema";
import { sql } from "drizzle-orm";
import { sanitizeLayers } from "@/components/kalender/layers";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

/**
 * Saves the Kalender layer selection per person (UX concept §5). It is a preference, so no audit
 * entry; the value is merged into `user_preference.saved_views` under the key "kalender".
 */
export async function saveKalenderLayers(input: unknown): Promise<void> {
  const current = await requireUser();
  const layers = sanitizeLayers(input);
  const patch = JSON.stringify({ kalender: layers });
  await db
    .insert(userPreference)
    .values({ userId: current.id, savedViews: { kalender: layers } })
    .onConflictDoUpdate({
      target: userPreference.userId,
      set: {
        savedViews: sql`${userPreference.savedViews} || ${patch}::jsonb`,
        updatedAt: new Date(),
      },
    });
}
