import "server-only";
import { type MarketColor, nextMarketColor } from "@marktwerk/core";
import { eventPreset } from "@marktwerk/db/schema";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";

/**
 * Which active (non-archived, `active = true`) markets use which colour: key = colour key, value =
 * market names sorted by name. `exceptPresetId` leaves one market out (its own edit form).
 * Callers have passed `requirePermission("event", "read")` or better.
 */
export async function listMarketColorUsage(
  exceptPresetId?: string,
): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ color: eventPreset.color, name: eventPreset.name })
    .from(eventPreset)
    .where(
      and(
        isNull(eventPreset.archivedAt),
        eq(eventPreset.active, true),
        exceptPresetId ? ne(eventPreset.id, exceptPresetId) : undefined,
      ),
    )
    .orderBy(asc(eventPreset.name));
  const usage: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.color) continue;
    const names = usage[r.color] ?? [];
    names.push(r.name);
    usage[r.color] = names;
  }
  return usage;
}

/**
 * For the colour picker of "Neuen Markt anlegen": the legend (`usage`) and the pre-selected colour.
 * `suggested` is what `createMarket` assigns without an explicit colour: `nextMarketColor` over every
 * non-archived market (inactive ones included, unlike the legend).
 */
export async function getMarketColorChoices(): Promise<{
  usage: Record<string, string[]>;
  suggested: MarketColor;
}> {
  const [usage, rows] = await Promise.all([
    listMarketColorUsage(),
    db.select({ color: eventPreset.color }).from(eventPreset).where(isNull(eventPreset.archivedAt)),
  ]);
  return { usage, suggested: nextMarketColor(rows.map((r) => r.color)) };
}
