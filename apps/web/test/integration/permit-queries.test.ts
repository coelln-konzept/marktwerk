import {
  contact,
  event,
  eventPermit,
  payable,
  permit,
  permitRequirement,
  settings,
  task,
} from "@marktwerk/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listEvents } from "@/server/queries/events";
import {
  calendarItems,
  dueItems,
  getPermit,
  listEventPermits,
  listLogbook,
  missingPermitCount,
  permitHealthByEvent,
} from "@/server/queries/permits";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

const TODAY = "2026-10-21";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let field: Actor;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  field = await createActor("field");
});

afterAll(async () => {
  await db.$client.end();
});

async function makeEvent(startsOn: string, name = "Flohmarkt") {
  const [row] = await db
    .insert(event)
    .values({
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      name,
      season: Number(startsOn.slice(0, 4)),
      startsOn,
      endsOn: startsOn,
      times: cat.times,
      pricePerMCents: 0,
      bookingFeeCents: 0,
    })
    .returning();
  if (!row) throw new Error("no event");
  return row;
}

type NewPermit = Partial<typeof permit.$inferInsert>;
async function makePermit(patch: NewPermit = {}) {
  const [row] = await db
    .insert(permit)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "water",
      title: "Wasser",
      season: 2026,
      ...patch,
    })
    .returning();
  if (!row) throw new Error("no permit");
  return row;
}

describe("logbook query", () => {
  it("lists permits with state, counts, fee and event numbers; filters by season, state and focus", async () => {
    const ev = await makeEvent("2026-11-08");
    const [authority] = await db
      .insert(contact)
      .values({ kind: "authority", name: "Stadtwerke" })
      .returning();
    const [req] = await db
      .insert(permitRequirement)
      .values({
        venueId: cat.venue.id,
        category: "city",
        permitType: "water",
        title: "Wasser",
        cadence: "per_season",
        leadTimeDays: 30,
        typicalFeeCents: 12000,
      })
      .returning();
    const missing = await makePermit({
      requirementId: req?.id,
      status: "not_started",
      applyBy: "2026-10-30",
      authorityContactId: authority?.id,
      responsibleStaffMemberId: cat.staff.anna.id,
    });
    const held = await makePermit({
      permitType: "market_permit",
      title: "Markt",
      status: "granted",
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
      deliverablesReceived: { stickers: 100 },
    });
    await makePermit({
      permitType: "toilets",
      category: "external",
      title: "Toiletten",
      status: "granted",
      validUntil: "2026-11-15",
    });
    await makePermit({ title: "Letztes Jahr", season: 2025, status: "granted" });
    await makePermit({
      title: "Mehrjährig",
      season: null,
      permitType: "landowner_ok",
      category: "external",
      status: "granted",
      validFrom: "2024-01-01",
      validUntil: "2029-12-31",
    });
    await makePermit({ title: "Ersetzt", status: "superseded" });
    await db.insert(eventPermit).values([
      { eventId: ev.id, permitId: missing.id },
      { eventId: ev.id, permitId: held.id },
    ]);
    await db.insert(payable).values({
      title: "Gebühr Wasser",
      scope: "venue_season",
      venueId: cat.venue.id,
      season: 2026,
      permitId: missing.id,
      category: "permit",
      totalGrossCents: 6400,
    });

    const all = await listLogbook(owner, { season: 2026 }, TODAY);
    expect(all.rows.map((r) => r.title).sort()).toEqual([
      "Markt",
      "Mehrjährig",
      "Toiletten",
      "Wasser",
    ]);
    expect(all.counts).toMatchObject({ missing: 1, granted: 2, expiring: 1 });
    expect(all.seasons).toEqual([2026, 2025]);
    expect(all.venues).toEqual([{ id: cat.venue.id, name: "Messeplatz Test" }]);

    const water = all.rows.find((r) => r.title === "Wasser");
    expect(water).toMatchObject({
      state: "missing",
      venueName: "Messeplatz Test",
      authorityName: "Stadtwerke",
      responsibleName: "Anna Test",
      cadence: "per_season",
      typicalFeeCents: 12000,
      feeCents: 6400,
      upcomingEvents: 1,
      linkedEvents: 1,
      nextEventOn: "2026-11-08",
    });
    const market = all.rows.find((r) => r.title === "Markt");
    expect(market).toMatchObject({ state: "granted", stickers: 100, feeCents: null });

    expect((await listLogbook(owner, { season: null }, TODAY)).rows).toHaveLength(5);
    expect((await listLogbook(owner, { season: 2026, state: "missing" }, TODAY)).rows).toHaveLength(
      1,
    );
    expect(
      (await listLogbook(owner, { season: 2026, focus: "fehlt" }, TODAY)).rows.map((r) => r.title),
    ).toEqual(["Wasser"]);
    // The focus counts permits that are missing for an upcoming market, whatever the season.
    expect(all.needsAction).toBe(1);
    expect(
      (await listLogbook(owner, { season: 2025, focus: "fehlt" }, TODAY)).rows.map((r) => r.title),
    ).toEqual(["Wasser"]);
    expect(
      (await listLogbook(owner, { season: 2026, category: "external" }, TODAY)).rows,
    ).toHaveLength(2);
    expect(
      (
        await listLogbook(
          owner,
          { season: 2026, venueId: "11111111-1111-4111-8111-111111111111" },
          TODAY,
        )
      ).rows,
    ).toHaveLength(0);
    // The counts ignore the state filter, so the chips stay meaningful.
    expect(
      (await listLogbook(owner, { season: 2026, state: "missing" }, TODAY)).counts.granted,
    ).toBe(2);

    // The sidebar badge is the same number as the focus chip of the Genehmigungen page.
    expect(await missingPermitCount(owner, TODAY)).toBe(all.needsAction);
    expect(await missingPermitCount(owner, TODAY)).toBe(1);
    expect((await listLogbook(field, { season: 2026 }, TODAY)).rows).toEqual([]);
    expect(await missingPermitCount(field, TODAY)).toBe(0);
  });

  it("opens one permit with events, tasks, fees and events that could still be added", async () => {
    const e1 = await makeEvent("2026-11-08", "Eins");
    await makeEvent("2026-11-15", "Zwei");
    await makeEvent("2025-05-01", "Vorbei");
    const p = await makePermit({ status: "preparing", conditions: ["Schilder aufstellen"] });
    await db.insert(eventPermit).values({ eventId: e1.id, permitId: p.id, required: false });
    await db.insert(task).values({
      permitId: p.id,
      source: "permit",
      title: "Wasser beantragen",
      dueAt: new Date("2026-10-30T22:59:00Z"),
      assigneeId: cat.staff.ben.id,
    });

    const detail = await getPermit(owner, p.id, TODAY);
    expect(detail).toMatchObject({
      id: p.id,
      state: "preparing",
      venueName: "Messeplatz Test",
      conditions: ["Schilder aufstellen"],
    });
    expect(detail?.events.map((e) => [e.name, e.required])).toEqual([["Eins", false]]);
    expect(detail?.tasks.map((t) => [t.title, t.assigneeName])).toEqual([
      ["Wasser beantragen", "Ben Test"],
    ]);
    expect(detail?.linkableEvents.map((e) => e.name)).toEqual(["Zwei"]);
    expect(await getPermit(owner, "nope", TODAY)).toBeNull();
    expect(await getPermit(field, p.id, TODAY)).toBeNull();
  });
});

describe("event permits and health", () => {
  it("summarises held/required and derives the health dimension", async () => {
    const ev = await makeEvent("2026-12-06");
    const granted = await makePermit({
      status: "granted",
      title: "Markt",
      permitType: "market_permit",
    });
    const applied = await makePermit({ status: "applied", title: "Wasser", applyBy: "2026-09-01" });
    await db.insert(eventPermit).values([
      { eventId: ev.id, permitId: granted.id },
      { eventId: ev.id, permitId: applied.id },
    ]);
    const summary = await listEventPermits(owner, { id: ev.id, startsOn: ev.startsOn }, TODAY);
    expect(summary.rows.map((r) => [r.title, r.state])).toEqual([
      ["Markt", "granted"],
      ["Wasser", "applied"],
    ]);
    expect([summary.held, summary.required, summary.health]).toEqual([1, 2, "warn"]);
    expect(
      (await listEventPermits(field, { id: ev.id, startsOn: ev.startsOn }, TODAY)).rows,
    ).toEqual([]);

    const healthy = await permitHealthByEvent([{ id: ev.id, startsOn: ev.startsOn }], TODAY);
    expect(healthy.get(ev.id)).toBe("warn");

    // The events list carries it as the permit dimension.
    const rows = await listEvents(owner, {});
    expect(rows.find((r) => r.id === ev.id)?.health.permits).toBe("warn");

    // Nothing applied for and close to the event: critical. An event without permits: not tracked.
    const soon = await makeEvent("2026-10-25", "Bald");
    const open = await makePermit({ status: "not_started", title: "Offen", applyBy: "2026-10-30" });
    await db.insert(eventPermit).values({ eventId: soon.id, permitId: open.id });
    const other = await makeEvent("2027-03-07", "Ohne");
    const map = await permitHealthByEvent(
      [
        { id: soon.id, startsOn: soon.startsOn },
        { id: other.id, startsOn: other.startsOn },
      ],
      TODAY,
    );
    expect(map.get(soon.id)).toBe("critical");
    expect(map.get(other.id)).toBeNull();
  });
});

describe("feeds for Übersicht and Kalender", () => {
  it("dueItems: unfiled by apply-by, applied by expected decision, within seven days, with urgency", async () => {
    await makePermit({
      title: "Überfällig",
      status: "not_started",
      applyBy: "2026-10-18",
      responsibleStaffMemberId: cat.staff.anna.id,
    });
    await makePermit({ title: "Heute", status: "preparing", applyBy: TODAY });
    await makePermit({ title: "Bald", status: "not_started", applyBy: "2026-10-27" });
    await makePermit({ title: "Später", status: "not_started", applyBy: "2026-11-30" });
    await makePermit({ title: "Entscheid", status: "applied", expectedDecisionOn: "2026-10-24" });
    await makePermit({ title: "Erteilt", status: "granted", applyBy: "2026-10-18" });
    const ev = await makeEvent("2026-04-01", "Alt");
    const stale = await makePermit({
      title: "Nur Vergangenheit",
      status: "not_started",
      applyBy: "2026-03-01",
    });
    await db.insert(eventPermit).values({ eventId: ev.id, permitId: stale.id });

    const items = await dueItems(owner, TODAY);
    expect(items.map((i) => [i.title, i.urgency, i.kind])).toEqual([
      ["Überfällig", "overdue", "permit"],
      ["Heute", "today", "permit"],
      ["Entscheid", "soon", "permit"],
      ["Bald", "soon", "permit"],
    ]);
    expect(items[0]).toMatchObject({
      dueOn: "2026-10-18",
      assigneeName: "Anna Test",
      meta: "Antrag · Messeplatz Test",
    });
    expect(items[0]?.href).toBe(`/genehmigungen?genehmigung=${items[0]?.id}`);
    expect(await dueItems(field, TODAY)).toEqual([]);
  });

  describe("permit horizon (company setting, default 30 days)", () => {
    const setHorizon = (permitHorizonDays: number) =>
      db
        .insert(settings)
        .values({ id: 1, companyName: "Test GmbH", permitHorizonDays })
        .onConflictDoUpdate({ target: settings.id, set: { permitHorizonDays } });

    it("shows a permit with apply-by in 20 days by default, as upcoming and after this week's items", async () => {
      await makePermit({ title: "Bald", status: "not_started", applyBy: "2026-10-27" });
      await makePermit({ title: "In 20 Tagen", status: "not_started", applyBy: "2026-11-10" });
      await makePermit({ title: "In 31 Tagen", status: "not_started", applyBy: "2026-11-21" });
      const items = await dueItems(owner, TODAY);
      expect(items.map((i) => [i.title, i.urgency])).toEqual([
        ["Bald", "soon"],
        ["In 20 Tagen", "upcoming"],
      ]);
    });

    it("hides it with a horizon of 14 days, and a bigger horizon reaches further", async () => {
      await makePermit({ title: "In 20 Tagen", status: "not_started", applyBy: "2026-11-10" });
      await makePermit({
        title: "In 60 Tagen",
        status: "applied",
        expectedDecisionOn: "2026-12-20",
      });
      await setHorizon(14);
      expect(await dueItems(owner, TODAY)).toEqual([]);
      await setHorizon(60);
      expect((await dueItems(owner, TODAY)).map((i) => [i.title, i.urgency])).toEqual([
        ["In 20 Tagen", "upcoming"],
        ["In 60 Tagen", "upcoming"],
      ]);
    });

    it("carries the events a permit is required for", async () => {
      const ev = await makeEvent("2026-11-14", "Novembermarkt");
      const p = await makePermit({ title: "Wasser", status: "not_started", applyBy: "2026-11-10" });
      await db.insert(eventPermit).values({ eventId: ev.id, permitId: p.id });
      const [item] = await dueItems(owner, TODAY);
      expect(item?.eventIds).toEqual([ev.id]);
    });
  });

  it("calendarItems: apply-by, decision and expiry in the range, with tones", async () => {
    await makePermit({ title: "A", status: "not_started", applyBy: "2026-11-05" });
    await makePermit({ title: "B", status: "applied", expectedDecisionOn: "2026-11-10" });
    await makePermit({ title: "C", status: "granted", validUntil: "2026-11-20" });
    await makePermit({ title: "D", status: "not_started", applyBy: "2026-12-24" });
    const items = await calendarItems(owner, "2026-11-01", "2026-11-30", TODAY);
    expect(items.map((i) => [i.date, i.layer, i.title, i.tone])).toEqual([
      ["2026-11-05", "permits", "Antrag: A · Messeplatz Test", "neutral"],
      ["2026-11-10", "permits", "Entscheidung erwartet: B · Messeplatz Test", "neutral"],
      ["2026-11-20", "permits", "Läuft ab: C · Messeplatz Test", "warn"],
    ]);
    expect(await calendarItems(field, "2026-11-01", "2026-11-30")).toEqual([]);
  });
});
