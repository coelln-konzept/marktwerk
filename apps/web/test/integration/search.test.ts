import { permit } from "@marktwerk/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { searchAs } from "@/server/search-core";
import { createVehicle } from "@/server/services/company";
import { createPayable } from "@/server/services/payables";
import { archivePermit } from "@/server/services/permits";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, insertEvent, insertTask } from "../helpers/tasks";

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

  it("an archived permit is not found", async () => {
    await archivePermit(owner, permitId);
    expect(kinds(await search(owner, "wassergenehmigung"))).not.toContain("permit");
  });
});
