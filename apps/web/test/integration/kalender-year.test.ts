import { SINGLE_EVENTS_KEY } from "@marktwerk/core";
import { event, eventPreset, eventType, venue } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LAYERS, type Layers } from "@/components/kalender/layers";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { getCalendarYear, listLegendMarkets } from "@/server/queries/kalender-year";
import { getMarketShortCodes } from "@/server/queries/market-short-codes";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, insertEvent } from "../helpers/tasks";

/**
 * Jahresübersicht (Fahrplan R22): the year's events with the Kalender narrowing, and the legend of the
 * markets with colour, Kürzel and number of dates.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let antiqueTypeId: string;
let otherVenueId: string;

const layers = (over: Partial<Layers> = {}): Layers => ({
  ...DEFAULT_LAYERS,
  types: ["flea", "antique"],
  ...over,
});

/** A market (preset) of the catalogue's type at the catalogue's venue unless told otherwise. */
async function insertMarket(values: Partial<typeof eventPreset.$inferInsert> & { name: string }) {
  const [row] = await db
    .insert(eventPreset)
    .values({
      key: values.name.toLowerCase().replace(/\W+/g, "-"),
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      pricePerMCents: 1200,
      bookingFeeCents: 500,
      schedule: cat.schedule,
      rules: cat.type.rules,
      ...values,
    })
    .returning();
  if (!row) throw new Error("market failed");
  return row;
}

/** An event of a market on [startsOn, endsOn]. */
async function marketEvent(
  presetId: string | null,
  name: string,
  startsOn: string,
  endsOn = startsOn,
  over: Partial<typeof event.$inferInsert> = {},
) {
  const row = await insertEvent(cat, name, startsOn);
  await db
    .update(event)
    .set({ presetId, endsOn, ...over })
    .where(eq(event.id, row.id));
  return row.id;
}

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  const [antique] = await db
    .insert(eventType)
    .values({
      key: "antique",
      nameDe: "Antikmarkt",
      nameEn: "Antique market",
      rules: cat.type.rules,
    })
    .returning();
  const [other] = await db
    .insert(venue)
    .values({ name: "Rheinufer Test", kind: "municipal", city: "Köln" })
    .returning();
  if (!antique || !other) throw new Error("seed failed");
  antiqueTypeId = antique.id;
  otherVenueId = other.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("getCalendarYear", () => {
  it("returns the year's events and a legend of every active market with colour, Kürzel and count", async () => {
    const altstadt = await insertMarket({ name: "Altstadt", color: "rose", shortCode: "ALT" });
    await insertMarket({ name: "Südbrücke", color: "olive" }); // no date in 2027 yet
    await marketEvent(altstadt.id, "Altstadt", "2027-03-27", "2027-03-29");
    await marketEvent(altstadt.id, "Altstadt", "2027-06-26", "2027-06-27");
    await marketEvent(altstadt.id, "Altstadt", "2027-07-24", "2027-07-25", { status: "cancelled" });
    await marketEvent(altstadt.id, "Altstadt", "2026-10-31"); // other year
    // Over New Year: belongs to both years.
    const silvester = await marketEvent(
      cat.presets.flea.id,
      "Testflohmarkt",
      "2026-12-31",
      "2027-01-01",
    );
    const single = await marketEvent(null, "CSD", "2027-07-04");

    const year = await getCalendarYear(owner, 2027, layers());
    expect(year.events.map((e) => e.name).sort()).toEqual([
      "Altstadt",
      "Altstadt",
      "Altstadt",
      "CSD",
      "Testflohmarkt",
    ]);
    expect(year.events.map((e) => e.id)).toContain(silvester);
    expect((await getCalendarYear(owner, 2026, layers())).events.map((e) => e.id)).toContain(
      silvester,
    );

    const codes = await getMarketShortCodes();
    expect(year.legend).toEqual([
      { key: altstadt.id, name: "Altstadt", code: "ALT", color: "rose", typeKey: "flea", count: 2 },
      {
        key: expect.any(String),
        name: "Südbrücke",
        code: expect.stringMatching(/^SÜ/),
        color: "olive",
        typeKey: "flea",
        count: 0,
      },
      {
        key: cat.presets.flea.id,
        name: "Testflohmarkt",
        code: codes.get(cat.presets.flea.id),
        color: null,
        typeKey: "flea",
        count: 1,
      },
      {
        key: cat.presets.festival.id,
        name: "Teststadtfest",
        code: codes.get(cat.presets.festival.id),
        color: null,
        typeKey: "flea",
        count: 0,
      },
      { key: SINGLE_EVENTS_KEY, name: "", code: null, color: null, typeKey: "flea", count: 1 },
    ]);
    // The Einzeltermin is an event without a market.
    expect(year.events.find((e) => e.id === single)?.presetId).toBeNull();
  });

  it("lists inactive and archived markets only when they have dates in the year", async () => {
    const sleeping = await insertMarket({ name: "Ruhender Markt", active: false, color: "slate" });
    await insertMarket({ name: "Stiller Markt", active: false });
    const gone = await insertMarket({ name: "Alter Markt", color: "plum", shortCode: "ALM" });
    await marketEvent(sleeping.id, "Ruhender Markt", "2027-05-02");
    await marketEvent(gone.id, "Alter Markt 2027", "2027-09-12");
    await db.update(eventPreset).set({ archivedAt: new Date() }).where(eq(eventPreset.id, gone.id));

    const legend = (await getCalendarYear(owner, 2027, layers())).legend;
    const names = legend.map((l) => l.name);
    expect(names).toContain("Ruhender Markt");
    expect(names).not.toContain("Stiller Markt");
    // An archived market keeps its colour, is named after its event and has no Kürzel any more.
    expect(legend.find((l) => l.key === gone.id)).toMatchObject({
      name: "Alter Markt 2027",
      code: null,
      color: "plum",
      count: 1,
    });
    expect((await listLegendMarkets()).map((m) => m.id)).not.toContain(gone.id);
  });

  it("follows the type layers and the Ort narrowing, also for markets without dates", async () => {
    const antik = await insertMarket({ name: "Antik am Rhein", eventTypeId: antiqueTypeId });
    const ufer = await insertMarket({ name: "Uferflohmarkt", venueId: otherVenueId });
    await db
      .update(event)
      .set({ venueId: otherVenueId })
      .where(eq(event.id, await marketEvent(ufer.id, "Uferflohmarkt", "2027-08-08")));

    const fleaOnly = await getCalendarYear(owner, 2027, layers({ types: ["flea"] }));
    expect(fleaOnly.legend.map((l) => l.name)).not.toContain("Antik am Rhein");
    expect(fleaOnly.legend.map((l) => l.name)).toContain("Uferflohmarkt");

    const both = await getCalendarYear(owner, 2027, layers());
    expect(both.legend.find((l) => l.key === antik.id)).toMatchObject({ typeKey: "antique" });

    // Ort: only the markets there (and their events); the type counts still see every type.
    const atUfer = await getCalendarYear(owner, 2027, layers({ venue: otherVenueId }));
    expect(atUfer.legend.map((l) => l.name)).toEqual(["Uferflohmarkt"]);
    expect(atUfer.events.map((e) => e.name)).toEqual(["Uferflohmarkt"]);
    expect(atUfer.rows).toHaveLength(1);
  });

  it("leaves markets without dates out while narrowing to Achtung/Kritisch or own duties", async () => {
    const legend = (await getCalendarYear(owner, 2027, layers({ critical: true }))).legend;
    expect(legend).toEqual([]);
  });

  it("shows field users only the events they work at", async () => {
    const { anna } = cat.staff;
    const field = asStaff(await createActor("field"), anna);
    const theirs = await insertEvent(cat, "Annas Markt", "2027-04-04", [
      { roleId: cat.roles.lead.id, staffId: anna.id },
    ]);
    await db.update(event).set({ presetId: cat.presets.flea.id }).where(eq(event.id, theirs.id));
    await marketEvent(cat.presets.flea.id, "Fremder Markt", "2027-04-11");

    const year = await getCalendarYear(field, 2027, layers());
    expect(year.events.map((e) => e.name)).toEqual(["Annas Markt"]);
    expect(year.legend.find((l) => l.key === cat.presets.flea.id)?.count).toBe(1);
    // The owner sees both.
    const all = await getCalendarYear(owner, 2027, layers());
    expect(all.legend.find((l) => l.key === cat.presets.flea.id)?.count).toBe(2);
  });
});
