import { suggestedVenueNeeds } from "@marktwerk/core";
import {
  auditLog,
  dutyRole,
  eventPreset,
  permit,
  permitRequirement,
  task,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { previewGeneration } from "@/server/queries/generation-preview";
import { createEventsFromPreset } from "@/server/services/events";
import { setVenueNeeds, undoVenueNeeds } from "@/server/services/permit-requirements";
import { PermitInputError } from "@/server/services/permits";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

/*
 * "Was braucht dieser Ort?" (product owner 2026-11-13, Fahrplan R28/R30): the dialog sets an Ort's permit
 * requirements from its kind. ADR 0024: a permit covering several dates is applied for by its own task; template
 * items only apply for per-date permits.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

const GENEHMIGUNG = "Genehmigung beantragen";
const DATES = ["2027-04-04", "2027-05-02", "2027-06-06"];

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  await db.insert(dutyRole).values({ key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" });
  await db
    .update(eventPreset)
    .set({ defaultDuties: { permits: cat.staff.anna.id } })
    .where(eq(eventPreset.id, cat.presets.flea.id));
});

afterAll(async () => {
  await db.$client.end();
});

const makePrivate = () =>
  db.update(venue).set({ kind: "private" }).where(eq(venue.id, cat.venue.id));

const liveRequirements = () =>
  db
    .select()
    .from(permitRequirement)
    .where(and(eq(permitRequirement.venueId, cat.venue.id), isNull(permitRequirement.archivedAt)))
    .orderBy(asc(permitRequirement.permitType));

const typesOf = async () => (await liveRequirements()).map((r) => r.permitType).sort();

/** The flea market's template: an item "Genehmigung beantragen" (market_permit) next to "Aufbau". */
async function marketTemplate(extra: Parameters<typeof baseItem>[0][] = []) {
  return seedPublishedTemplate(
    owner,
    [
      baseItem({
        title: GENEHMIGUNG,
        category: "permits",
        offsetDays: -180,
        permitType: "market_permit",
      }),
      baseItem({ title: "Aufbau", phase: "live", anchorKey: "setup_day", offsetDays: 0 }),
      ...extra.map((patch) => baseItem(patch)),
    ],
    { presetIds: [cat.presets.flea.id] },
  );
}

const permitOfType = async (type: (typeof permit.$inferSelect)["permitType"]) => {
  const rows = await db.select().from(permit).where(eq(permit.permitType, type));
  expect(rows, type).toHaveLength(1);
  return rows[0] as typeof permit.$inferSelect;
};

const openApplyTasks = (permitId: string) =>
  db
    .select()
    .from(task)
    .where(and(eq(task.permitId, permitId), ne(task.status, "cancelled")));

describe("setVenueNeeds: the dialog's ticks become requirements", () => {
  it("creates the private defaults: Einverständnis des Eigentümers and Festsetzung", async () => {
    await makePrivate();
    const change = await setVenueNeeds(owner, cat.venue.id, suggestedVenueNeeds("private", []));

    expect(change.created).toHaveLength(2);
    expect(change.archived).toEqual([]);
    const rows = await liveRequirements();
    expect(rows.map((r) => [r.permitType, r.title, r.category, r.cadence, r.leadTimeDays])).toEqual(
      [
        ["market_fixing", "Festsetzung (§ 69 GewO)", "city", "per_season", 180],
        ["landowner_ok", "Einverständnis des Eigentümers", "external", "per_season", 150],
      ],
    );
    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "permit_requirement.create"));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => (e.diff as { source?: string }).source === "venue_needs")).toBe(
      true,
    );
  });

  it("adds the ticked extras and is idempotent", async () => {
    await setVenueNeeds(owner, cat.venue.id, ["market_permit", "market_fixing", "water"]);
    const again = await setVenueNeeds(owner, cat.venue.id, [
      "market_permit",
      "market_fixing",
      "water",
    ]);
    expect(again).toEqual({ created: [], archived: [] });
    expect(await typesOf()).toEqual(["market_fixing", "market_permit", "water"]);
  });

  it("switches Städtisch → Privat: the owner's OK replaces the Marktgenehmigung, the rest stays; undo puts it back", async () => {
    await setVenueNeeds(owner, cat.venue.id, ["market_permit", "market_fixing", "no_parking"]);
    // A requirement the dialog does not offer, with its own details.
    await db.insert(permitRequirement).values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "traffic_order",
      title: "Sperrung",
      cadence: "per_season",
      leadTimeDays: 42,
    });
    await makePrivate();
    const wanted = suggestedVenueNeeds("private", await typesOf());
    expect(wanted).toEqual(["landowner_ok", "market_fixing", "no_parking"]);

    const change = await setVenueNeeds(owner, cat.venue.id, wanted);
    expect(change.created).toHaveLength(1);
    expect(change.archived).toHaveLength(1);
    expect(await typesOf()).toEqual(
      ["no_parking", "market_fixing", "landowner_ok", "traffic_order"].sort(),
    );

    const undone = await undoVenueNeeds(owner, cat.venue.id, change);
    expect(undone.changed).toBe(2);
    expect(await typesOf()).toEqual(
      ["market_permit", "market_fixing", "no_parking", "traffic_order"].sort(),
    );
  });

  it("rejects unknown types and an archived Ort", async () => {
    await expect(setVenueNeeds(owner, cat.venue.id, ["gema"])).rejects.toBeInstanceOf(
      PermitInputError,
    );
    await db.update(venue).set({ archivedAt: new Date() }).where(eq(venue.id, cat.venue.id));
    await expect(setVenueNeeds(owner, cat.venue.id, ["water"])).rejects.toMatchObject({
      code: "invalid_venue",
    });
  });

  it("needs the delete grant to remove a requirement (staff may only add)", async () => {
    const staff = await createActor("staff");
    await setVenueNeeds(staff, cat.venue.id, ["market_permit"]);
    await expect(setVenueNeeds(staff, cat.venue.id, [])).rejects.toThrow();
    expect(await typesOf()).toEqual(["market_permit"]);
    const field = await createActor("field");
    await expect(setVenueNeeds(field, cat.venue.id, ["water"])).rejects.toThrow();
  });
});

describe("permits of the Ort's needs and their apply tasks (ADR 0024)", () => {
  it("private Ort: each season permit gets its own '… beantragen' task, template items never apply for it", async () => {
    await makePrivate();
    await setVenueNeeds(owner, cat.venue.id, suggestedVenueNeeds("private", []));
    await marketTemplate();
    await createEventsFromPreset(owner, cat.presets.flea.id, DATES);

    for (const [type, title] of [
      ["landowner_ok", "Einverständnis des Eigentümers beantragen"],
      ["market_fixing", "Festsetzung (§ 69 GewO) beantragen"],
    ] as const) {
      const p = await permitOfType(type);
      const tasks = await openApplyTasks(p.id);
      expect(
        tasks.map((t) => [t.title, t.source, t.eventId]),
        type,
      ).toEqual([[title, "permit", null]]);
    }
    // The template's "Genehmigung beantragen" (market_permit) applies for no season permit: it stays unlinked.
    const items = await db.select().from(task).where(eq(task.title, GENEHMIGUNG));
    expect(items).toHaveLength(DATES.length);
    for (const t of items) expect(t.permitId).toBeNull();
    expect(await db.select().from(task).where(eq(task.status, "cancelled"))).toHaveLength(0);
  });

  it("the Markt planen preview counts the season permit's own task", async () => {
    await makePrivate();
    await setVenueNeeds(owner, cat.venue.id, ["landowner_ok"]);
    await marketTemplate();
    const preview = await previewGeneration(cat.presets.flea.id, ["2027-04-04"]);
    // Genehmigung + Aufbau from the template, plus the OK's own "beantragen" task.
    expect(preview.dates[0]).toMatchObject({ permitsNew: 1, tasks: 3 });
  });

  it("a per-date permit is applied for by the template task of its date, without an own task", async () => {
    await setVenueNeeds(owner, cat.venue.id, ["no_parking"]);
    await seedPublishedTemplate(
      owner,
      [
        baseItem({
          title: "Halteverbot beantragen",
          category: "permits",
          offsetDays: -21,
          permitType: "no_parking",
        }),
      ],
      { presetIds: [cat.presets.flea.id] },
    );
    await createEventsFromPreset(owner, cat.presets.flea.id, DATES.slice(0, 2));

    const permits = await db.select().from(permit).orderBy(asc(permit.applyBy));
    expect(permits).toHaveLength(2);
    for (const p of permits) {
      const tasks = await openApplyTasks(p.id);
      expect(tasks.map((t) => [t.title, t.source])).toEqual([
        ["Halteverbot beantragen", "template"],
      ]);
    }
    expect(await db.select().from(task).where(eq(task.source, "permit"))).toHaveLength(0);
  });
});
