import "server-only";
import { marketShortCodes, type ShortCodeMarket } from "@marktwerk/core";
import { eventPreset } from "@marktwerk/db/schema";
import { isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "../db";

/** Every non-archived market with what the Kürzel is derived from (active ones flagged). */
export const listShortCodeMarkets = cache(
  async (): Promise<(ShortCodeMarket & { active: boolean })[]> =>
    db
      .select({
        id: eventPreset.id,
        name: eventPreset.name,
        shortCode: eventPreset.shortCode,
        active: eventPreset.active,
      })
      .from(eventPreset)
      .where(isNull(eventPreset.archivedAt)),
);

/**
 * The Kürzel to show per market (preset id → code, Fahrplan R15): the market's own one, else derived
 * from its name (`marketShortCodes`), resolved over all non-archived markets so a market shows the same
 * code on every page. One query per request. Callers have passed `requirePermission("event", "read")`.
 */
export const getMarketShortCodes = cache(
  async (): Promise<Map<string, string>> => marketShortCodes(await listShortCodeMarkets()),
);
