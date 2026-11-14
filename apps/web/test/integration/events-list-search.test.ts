import { event, venue } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { countEvents, eventSearchMode, listEvents } from "@/server/queries/events";
import { searchAs } from "@/server/search-core";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { insertEvent } from "../helpers/tasks";

/**
 * The Veranstaltungen list search (UX-038/049/066): it matches like the command palette, so the
 * palette's "Alle N anzeigen" and the list count the same Termine; counts for the "N abgesagt" chip
 * and the "Auch passend" hint.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let bonnVenue: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  const [bonn] = await db
    .insert(venue)
    .values({ name: "Rheinaue", kind: "private", city: "Bonn" })
    .returning();
  bonnVenue = bonn?.id as string;

  await insertEvent(cat, "Nippes Flohmarkt", "2026-11-14");
  await insertEvent(cat, "Nippes Flohmarkt", "2026-11-28");
  await insertEvent(cat, "Nippes Flohmarkt", "2025-11-15");
  const cancelled = await insertEvent(cat, "Nippes Flohmarkt", "2026-12-12");
  await db.update(event).set({ status: "cancelled" }).where(eq(event.id, cancelled.id));
  const atBonn = await insertEvent(cat, "Rheinaue Trödel", "2026-12-05");
  await db.update(event).set({ venueId: bonnVenue }).where(eq(event.id, atBonn.id));
  // "bonn" inside a word, not at its start.
  await insertEvent(cat, "Abonnentenmarkt", "2026-12-19");
});

afterAll(async () => {
  await db.$client.end();
});

const names = (rows: { name: string; startsOn: string }[]) =>
  rows.map((r) => `${r.name} ${r.startsOn}`).toSorted();

describe("events list search", () => {
  it("folds umlauts like the palette: 'koln' finds the Köln venue", async () => {
    const mode = await eventSearchMode(owner, "koln");
    expect(mode).toBe("wordStarts");
    const rows = await listEvents(owner, { q: "koln", qMode: mode });
    expect(rows.every((r) => r.venueName === "Messeplatz Test")).toBe(true);
    expect(rows).toHaveLength(5);
  });

  it("prefers word starts: 'bonn' finds the Bonn venue, not 'Abonnentenmarkt'", async () => {
    const mode = await eventSearchMode(owner, "bonn");
    expect(mode).toBe("wordStarts");
    expect(names(await listEvents(owner, { q: "bonn", qMode: mode }))).toEqual([
      "Rheinaue Trödel 2026-12-05",
    ]);
    // Without a word start anywhere, a match inside a word still counts.
    const inside = await eventSearchMode(owner, "onn");
    expect(inside).toBe("words");
    expect(names(await listEvents(owner, { q: "onn", qMode: inside }))).toEqual([
      "Abonnentenmarkt 2026-12-19",
      "Rheinaue Trödel 2026-12-05",
    ]);
  });

  it("allows a typo in a long word when nothing matches as typed", async () => {
    const mode = await eventSearchMode(owner, "nipes");
    expect(mode).toBe("typos");
    expect(await countEvents(owner, { q: "nipes", qMode: mode })).toBe(4);
  });

  it("finds a Termin by its German date", async () => {
    const mode = await eventSearchMode(owner, "28.11.2026");
    expect(names(await listEvents(owner, { q: "28.11.2026", qMode: mode }))).toEqual([
      "Nippes Flohmarkt 2026-11-28",
    ]);
  });

  it("counts what the palette counts for the same query", async () => {
    for (const q of ["nippes", "koln", "bonn", "nipes", "trodel"]) {
      const palette = (await searchAs(owner, "de", q)).groups.event?.total ?? 0;
      const mode = await eventSearchMode(owner, q);
      expect({ q, n: await countEvents(owner, { q, qMode: mode }) }).toEqual({ q, n: palette });
    }
  });

  it("counts the cancelled and past matches the default view leaves out", async () => {
    const q = "nippes";
    const qMode = await eventSearchMode(owner, q);
    const today = "2026-11-14";
    const shown = await listEvents(owner, { q, qMode, status: "active", from: today });
    expect(names(shown)).toEqual(["Nippes Flohmarkt 2026-11-14", "Nippes Flohmarkt 2026-11-28"]);
    expect(await countEvents(owner, { q, qMode, status: "cancelled", from: today })).toBe(1);
    expect(await countEvents(owner, { q, qMode, endedBefore: today })).toBe(1);
    expect(await countEvents(owner, { q, qMode })).toBe(4);
  });

  it("narrows to one Ort", async () => {
    expect(names(await listEvents(owner, { venueId: bonnVenue }))).toEqual([
      "Rheinaue Trödel 2026-12-05",
    ]);
  });

  it("treats % and _ as plain characters", async () => {
    expect(await countEvents(owner, { q: "%", qMode: "words" })).toBe(0);
    expect(await countEvents(owner, { q: "_", qMode: await eventSearchMode(owner, "_") })).toBe(0);
  });
});
