import { contact, permit } from "@marktwerk/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { searchAs } from "@/server/search-core";
import { createVehicle } from "@/server/services/company";
import { createPayable } from "@/server/services/payables";
import { archivePermit } from "@/server/services/permits";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, insertEvent, insertSeason, insertTask } from "../helpers/tasks";

/** Command palette search: tasks, permits, payments and vehicles next to events and people. */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let staff: Actor;
let field: Actor;
let ownEvent: string;
let foreignEvent: string;
let ownTask: string;
let permitId: string;
let payableId: string;
let vehicleId: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  staff = asStaff(await createActor("staff"), cat.staff.ben);
  field = asStaff(await createActor("field"), cat.staff.anna);
  ownEvent = (
    await insertEvent(cat, "Brüsseler Platz Markt", "2026-11-14", [
      { roleId: cat.roles.lead.id, staffId: cat.staff.anna.id },
    ])
  ).id;
  foreignEvent = (await insertEvent(cat, "Fremder Markt", "2026-11-21")).id;

  ownTask = (await insertTask({ title: "Plakate für Köln drucken", eventId: ownEvent })).id;
  await insertTask({ title: "Plakate für Köln aufhängen", eventId: foreignEvent });
  await insertTask({ title: "Plakate ohne Event" });

  const [p] = await db
    .insert(permit)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "water",
      title: "Wassergenehmigung Köln",
      season: 2026,
    })
    .returning();
  permitId = p?.id as string;

  payableId = (
    await createPayable(
      owner,
      {
        title: "Plakatdruck Köln",
        scope: "event",
        eventId: ownEvent,
        category: "marketing",
        totalGrossCents: 20_000,
      },
      [{ dueOn: "2026-11-01", amountCents: 20_000 }],
    )
  ).id;

  vehicleId = (
    await createVehicle(owner, {
      name: "Kölner Transporter",
      plate: "K-MW 77",
      make: null,
      model: null,
      vin: null,
      firstRegistrationOn: null,
      grossWeightKg: 3000,
      odometerKm: null,
      odometerRecordedOn: null,
      insurer: null,
      policyNumber: null,
      notes: null,
    })
  ).id;
});

afterAll(async () => {
  await db.$client.end();
});

const search = async (actor: Actor, q: string) => (await searchAs(actor, "de", q)).hits;
const kinds = (hits: { kind: string }[]) => hits.map((h) => h.kind);

describe("searchAs", () => {
  it("finds tasks, permits, payments and vehicles with links, ignoring umlauts", async () => {
    const hits = await search(owner, "koln");
    expect(hits.filter((h) => h.kind === "task").map((h) => h.title)).toEqual([
      "Plakate für Köln aufhängen",
      "Plakate für Köln drucken",
    ]);
    expect(hits.find((h) => h.kind === "permit")).toMatchObject({
      title: "Wassergenehmigung Köln",
      href: `/genehmigungen?genehmigung=${permitId}`,
    });
    expect(hits.find((h) => h.kind === "payable")).toMatchObject({
      title: "Plakatdruck Köln",
      href: `/finanzen/posten/${payableId}`,
    });
    expect(hits.find((h) => h.kind === "vehicle")).toMatchObject({
      title: "Kölner Transporter",
      subtitle: "K-MW 77",
      href: `/firma/fahrzeuge/${vehicleId}`,
    });
    // A task opens in its board drawer.
    expect(hits.find((h) => h.title === "Plakate für Köln drucken")?.href).toBe(
      `/veranstaltungen/${ownEvent}/board?aufgabe=${ownTask}`,
    );
  });

  it("finds a vehicle by its plate and a permit by its venue", async () => {
    expect(kinds(await search(owner, "k-mw 77"))).toContain("vehicle");
    expect((await search(owner, "messeplatz")).some((h) => h.kind === "permit")).toBe(true);
  });

  it("needs two characters", async () => {
    expect(await search(owner, "k")).toEqual([]);
    expect(await search(owner, "  ")).toEqual([]);
  });

  it("staff find tasks, permits and vehicles but no payments", async () => {
    const hits = await search(staff, "koln");
    expect(kinds(hits)).toContain("task");
    expect(kinds(hits)).toContain("permit");
    expect(kinds(hits)).toContain("vehicle");
    expect(kinds(hits)).not.toContain("payable");
  });

  it("field users only find tasks of their own events, and nothing of permits, money or vehicles", async () => {
    const hits = await search(field, "koln");
    // (The event itself matches through its venue city.)
    expect(hits.filter((h) => h.kind !== "event").map((h) => `${h.kind}:${h.title}`)).toEqual([
      "task:Plakate für Köln drucken",
    ]);
    expect(hits.filter((h) => h.kind === "event").map((h) => h.title)).toEqual([
      "Brüsseler Platz Markt",
    ]);
    // Events are scoped the same way.
    expect((await search(field, "markt")).filter((h) => h.kind === "event")).toHaveLength(1);
    expect((await search(owner, "markt")).filter((h) => h.kind === "event")).toHaveLength(2);
  });

  it("matches every word, in any order, with the year", async () => {
    const tasks = (await search(owner, "köln plakate")).filter((h) => h.kind === "task");
    expect(tasks.map((h) => h.title).sort()).toEqual([
      "Plakate für Köln aufhängen",
      "Plakate für Köln drucken",
    ]);
    // The year (and a dd.mm. date) belong to the event's date.
    expect((await search(owner, "markt 2026")).some((h) => h.kind === "event")).toBe(true);
    expect((await search(owner, "markt 2027")).some((h) => h.kind === "event")).toBe(false);
    expect((await search(owner, "markt 14.11.")).filter((h) => h.kind === "event")).toHaveLength(1);
  });

  it("shows the year of events outside the running one", async () => {
    await insertEvent(cat, "Jahrmarkt Fernstadt", "2031-05-10");
    const hit = (await search(owner, "fernstadt")).find((h) => h.kind === "event");
    expect(hit?.subtitle).toContain("2031");
  });

  it("leaves out fragments inside words when words start with the query, and counts the real total", async () => {
    await insertTask({ title: "Newsletter an Abonnenten" });
    for (let i = 1; i <= 8; i++) await insertTask({ title: `Bonn aufräumen ${i}` });
    const result = await searchAs(owner, "de", "bonn");
    const tasks = result.hits.filter((h) => h.kind === "task");
    expect(tasks).toHaveLength(6);
    expect(tasks.every((h) => h.title.startsWith("Bonn"))).toBe(true);
    expect(result.groups.task?.total).toBe(8);
    // Without a word-start match the fragment is better than nothing.
    expect((await search(owner, "bonnenten")).some((h) => h.title.includes("Abonnenten"))).toBe(
      true,
    );
  });

  it("links the full list where there is one", async () => {
    const result = await searchAs(owner, "de", "markt");
    expect(result.groups.event).toMatchObject({ total: 2, href: "/veranstaltungen?q=markt" });
    expect(result.groups.task?.href).toBeUndefined();
  });

  it("shows permit dates as dates", async () => {
    await db.insert(permit).values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "water",
      title: "Halteverbot – 2026-04-18",
      season: 2026,
    });
    const hit = (await search(owner, "halteverbot")).find((h) => h.kind === "permit");
    expect(hit?.title).toBe("Halteverbot – 18.04.2026");
  });

  it("finds season tasks with their market and season, also by the market's name (R13)", async () => {
    const season = await insertSeason(cat);
    const t = await insertTask({ title: "Termine planen", seasonId: season.id });
    await insertTask({ title: "Termine planen", eventId: foreignEvent });
    const hits = (await search(owner, "termine planen")).filter((h) => h.kind === "task");
    expect(hits).toHaveLength(2);
    expect(hits.find((h) => h.href === `/board?aufgabe=${t.id}`)?.season).toEqual({
      id: season.id,
      year: 2027,
      presetId: cat.presets.flea.id,
      name: "Testflohmarkt",
      href: `/vorlagen/${cat.presets.flea.id}`,
    });
    // With several words the market's name and the season year count, like an event's name.
    const byMarket = (await search(owner, "termine testflohmarkt")).filter(
      (h) => h.kind === "task",
    );
    expect(byMarket.map((h) => h.href)).toEqual([`/board?aufgabe=${t.id}`]);
    expect(
      (await search(owner, "termine 2027")).filter((h) => h.kind === "task").map((h) => h.href),
    ).toEqual([`/board?aufgabe=${t.id}`]);
    // Staff find it too, without the link to the market page.
    expect(
      (await search(staff, "termine testflohmarkt")).find((h) => h.kind === "task")?.season?.href,
    ).toBeNull();
  });

  it("an archived permit is not found", async () => {
    await archivePermit(owner, permitId);
    expect(kinds(await search(owner, "wassergenehmigung"))).not.toContain("permit");
  });
});

describe("searchAs with typos (pg_trgm)", () => {
  beforeEach(async () => {
    await insertEvent(cat, "Flohmarkt Bonn Rheinaue", "2026-11-28");
    await db.insert(contact).values({ kind: "other", name: "Stadtverwaltung Bonn", city: "Bonn" });
  });

  it("finds 'Flohmarkt' for 'Flomarkt' and 'Bonn' for 'bnon', below every literal match", async () => {
    const flo = await searchAs(owner, "de", "Flomarkt");
    expect(flo.hits.filter((h) => h.kind === "event").map((h) => h.title)).toEqual([
      "Flohmarkt Bonn Rheinaue",
    ]);
    expect(flo.hits.every((h) => h.score === 4)).toBe(true);
    // The list page doesn't allow for typos: no "show all" link that would come up empty.
    expect(flo.groups.event).toEqual({ total: 1, href: undefined });

    const bnon = await search(owner, "bnon");
    expect(bnon.filter((h) => h.kind === "event").map((h) => h.title)).toEqual([
      "Flohmarkt Bonn Rheinaue",
    ]);
    expect(bnon.filter((h) => h.kind === "contact").map((h) => h.title)).toEqual([
      "Stadtverwaltung Bonn",
    ]);
  });

  it("allows a typo in one word and takes the others as typed", async () => {
    const hits = await search(owner, "flomarkt bonn");
    expect(hits.filter((h) => h.kind === "event").map((h) => h.title)).toEqual([
      "Flohmarkt Bonn Rheinaue",
    ]);
    // "Markt" alone is not close enough to "Flomarkt" ("Brüsseler Platz Markt", "Fremder Markt").
    expect(hits.some((h) => h.title.endsWith(" Markt"))).toBe(false);
  });

  it("exact matches win: no typo matches while anything matches as typed", async () => {
    await insertEvent(cat, "Flomarkt Beuel", "2026-12-05");
    // The literal "Flomarkt Beuel" is all there is; "Flohmarkt Bonn Rheinaue" would only be a typo.
    expect(
      (await search(owner, "flomarkt")).filter((h) => h.kind === "event").map((h) => h.title),
    ).toEqual(["Flomarkt Beuel"]);
    const bonn = await searchAs(owner, "de", "bonn");
    expect(bonn.hits.every((h) => (h.score ?? 3) < 4)).toBe(true);
    expect(bonn.groups.event).toEqual({ total: 1, href: "/veranstaltungen?q=bonn" });
    // The title that starts with the query still comes first.
    expect((await search(owner, "flohmarkt bonn"))[0]).toMatchObject({
      title: "Flohmarkt Bonn Rheinaue",
      score: 0,
    });
  });

  it("does not guess for short words or unrelated ones", async () => {
    expect(await search(owner, "bnn")).toEqual([]);
    expect(await search(owner, "zwqx")).toEqual([]);
    // "Bonn" and "Born" share too little.
    expect((await search(owner, "born")).some((h) => h.title.includes("Bonn"))).toBe(false);
  });
});
