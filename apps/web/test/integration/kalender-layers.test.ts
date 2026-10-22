import { obligation, permit, shift } from "@marktwerk/db/schema";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activePreset,
  availableLayers,
  DEFAULT_LAYERS,
  type Layers,
  layerParams,
  PRESETS,
  parseLayers,
  sanitizeLayers,
} from "@/components/kalender/layers";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listCalendarDeadlines } from "@/server/queries/kalender";
import { createPayable } from "@/server/services/payables";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, dueOn, insertEvent, insertTask, TODAY } from "../helpers/tasks";

/**
 * Kalender module layers: Aufgaben, Genehmigungen, Raten, Pflichten and Schichten next to the events,
 * per role, with the narrowing and the layer selection helpers.
 */

const RANGE = { from: "2026-10-01", to: "2026-10-31" };
const ALL: Layers["deadlines"] = ["tasks", "permits", "shifts", "installments", "obligations"];
const selection = (over: Partial<Layers> = {}): Layers => ({ ...DEFAULT_LAYERS, ...over });

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let staffActor: Actor;
let fieldActor: Actor;
let eventId: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00+02:00"));
  await resetDatabase();
  cat = await seedCatalogue();
  const { anna, ben } = cat.staff;
  owner = await createActor("owner");
  staffActor = asStaff(await createActor("staff"), anna);
  fieldActor = asStaff(await createActor("field"), anna);
  eventId = (
    await insertEvent(cat, "Oktobermarkt", "2026-10-24", [
      { roleId: cat.roles.lead.id, staffId: anna.id },
    ])
  ).id;

  await insertTask({
    title: "Annas Aufgabe",
    eventId,
    assigneeId: anna.id,
    dueAt: dueOn("2026-10-19"),
  });
  await insertTask({
    title: "Bens Aufgabe",
    eventId,
    assigneeId: ben.id,
    dueAt: dueOn("2026-10-28"),
  });
  await db.insert(permit).values({
    venueId: cat.venue.id,
    category: "city",
    permitType: "water",
    title: "Wasser",
    season: 2026,
    status: "not_started",
    applyBy: "2026-10-19",
  });
  await createPayable(
    owner,
    { title: "Platzmiete", scope: "event", eventId, category: "location", totalGrossCents: 50_000 },
    [{ dueOn: "2026-10-18", amountCents: 50_000 }],
  );
  await db.insert(shift).values({
    eventId: null,
    staffMemberId: anna.id,
    workDate: "2026-10-14",
    status: "confirmed",
  });
  await db.insert(obligation).values({
    kind: "other",
    title: "Brandschutz",
    scope: "company",
    nextDueOn: "2026-10-24",
    responsibleStaffMemberId: anna.id,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.$client.end();
});

const layersOf = (items: { layer: string }[]) => [...new Set(items.map((i) => i.layer))].sort();

describe("listCalendarDeadlines", () => {
  it("returns every module layer for an owner, in date order", async () => {
    const items = await listCalendarDeadlines(owner, RANGE, selection(), TODAY);
    expect(layersOf(items)).toEqual([...ALL].sort());
    expect(items.map((i) => i.date)).toEqual([...items.map((i) => i.date)].sort());
    // 2 tasks, 1 permit, 1 rate, 1 shift group, 1 obligation
    expect(items).toHaveLength(6);
    for (const item of items) expect(item.href).toMatch(/^\//);
  });

  it("only fetches the layers that are switched on", async () => {
    const onlyPermits = await listCalendarDeadlines(
      owner,
      RANGE,
      selection({ deadlines: ["permits"] }),
      TODAY,
    );
    expect(layersOf(onlyPermits)).toEqual(["permits"]);
    expect(await listCalendarDeadlines(owner, RANGE, selection({ deadlines: [] }), TODAY)).toEqual(
      [],
    );
  });

  it("stays inside the shown range", async () => {
    const items = await listCalendarDeadlines(
      owner,
      { from: "2026-10-20", to: "2026-10-27" },
      selection(),
      TODAY,
    );
    expect(items.map((i) => i.date).every((d) => d >= "2026-10-20" && d <= "2026-10-27")).toBe(
      true,
    );
    expect(layersOf(items)).toEqual(["obligations"]);
  });

  it("gives no Raten and no Schichten layer to staff, even when selected", async () => {
    const items = await listCalendarDeadlines(staffActor, RANGE, selection(), TODAY);
    expect(layersOf(items)).toEqual(["obligations", "permits", "tasks"]);
    // Staff only see the tasks assigned to them.
    expect(items.filter((i) => i.layer === "tasks").map((i) => i.title)).toEqual(["Annas Aufgabe"]);
  });

  it("gives field users their own tasks and shifts only", async () => {
    const items = await listCalendarDeadlines(fieldActor, RANGE, selection(), TODAY);
    expect(layersOf(items)).toEqual(["shifts", "tasks"]);
    expect(items.filter((i) => i.layer === "tasks").map((i) => i.title)).toEqual(["Annas Aufgabe"]);
  });

  it("'Nur meine Zuständigkeit' narrows an owner's tasks to the own ones", async () => {
    const asAnna = asStaff(owner, cat.staff.anna);
    const all = await listCalendarDeadlines(
      asAnna,
      RANGE,
      selection({ deadlines: ["tasks"] }),
      TODAY,
    );
    expect(all.map((i) => i.title).sort()).toEqual(["Annas Aufgabe", "Bens Aufgabe"]);
    const mine = await listCalendarDeadlines(
      asAnna,
      RANGE,
      selection({ deadlines: ["tasks"], mine: true }),
      TODAY,
    );
    expect(mine.map((i) => i.title)).toEqual(["Annas Aufgabe"]);
  });

  it("'Nur Achtung und Kritisch' keeps only warn and critical entries", async () => {
    const items = await listCalendarDeadlines(owner, RANGE, selection({ critical: true }), TODAY);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tone === "warn" || i.tone === "critical")).toBe(true);
    // The overdue task, permit deadline and rate are critical; Ben's task a week out is neutral.
    expect(items.map((i) => i.title)).not.toContain("Bens Aufgabe");
  });

  it("marks overdue entries critical", async () => {
    const items = await listCalendarDeadlines(owner, RANGE, selection(), TODAY);
    const tone = (title: string) => items.find((i) => i.title.includes(title))?.tone;
    expect(tone("Annas Aufgabe")).toBe("critical");
    expect(tone("Platzmiete")).toBe("critical");
    expect(tone("Wasser")).toBe("critical");
    expect(tone("Bens Aufgabe")).toBe("neutral");
  });
});

describe("layer selection", () => {
  it("offers each role only the module layers it may see", () => {
    expect(availableLayers("owner", false)).toEqual(ALL);
    expect(availableLayers("staff", false)).toEqual(["tasks", "permits", "obligations"]);
    expect(availableLayers("field", false)).toEqual(["tasks"]);
    expect(availableLayers("field", true)).toEqual(["tasks", "shifts"]);
  });

  it("round-trips through the URL", () => {
    const layers = selection({ deadlines: ["permits", "tasks"], types: ["flea"], critical: true });
    const params = layerParams(layers);
    expect(params.frist).toBe("permits,tasks");
    expect(
      parseLayers(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))),
    ).toEqual(sanitizeLayers(layers));
  });

  it("an explicit URL without module layers means none, not all", () => {
    expect(parseLayers({ ebenen: "1", typ: "flea", feiertage: "1" })?.deadlines).toEqual([]);
    expect(parseLayers({})).toBeNull();
  });

  it("selections saved before the module layers existed show them all", () => {
    expect(sanitizeLayers({ types: ["flea"], holidays: false }).deadlines).toEqual(ALL);
    expect(sanitizeLayers({ deadlines: ["tasks", "nonsense", 3] }).deadlines).toEqual(["tasks"]);
  });

  it("the preset 'Märkte + Genehmigungen' includes the permits layer", () => {
    const markets = PRESETS.find((p) => p.key === "markets");
    expect(markets?.deadlines).toEqual(["permits"]);
    expect(markets?.types).toEqual(["flea", "antique"]);
    expect(activePreset(selection({ types: ["flea", "antique"], deadlines: ["permits"] }))).toBe(
      "markets",
    );
  });

  it("recognises a preset among the layers the role can see", () => {
    expect(activePreset(selection(), ["tasks", "permits"])).toBe("all");
    expect(activePreset(selection({ deadlines: ["tasks"] }), ["tasks", "permits"])).toBeNull();
    expect(activePreset(selection({ types: [], deadlines: ALL, holidays: true }))).toBe(
      "deadlines",
    );
  });
});
