import { auditLog, contact, event, venue, venueRow, zone } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  getVenue,
  getVenueForEdit,
  listLandownerOptions,
  listVenueOptions,
  listVenues,
} from "@/server/queries/venues";
import { createEventsFromPreset } from "@/server/services/events";
import {
  archiveVenue,
  createRow,
  createVenue,
  createZone,
  deleteRow,
  deleteZone,
  moveZone,
  type RowInput,
  renameZone,
  restoreRow,
  restoreVenue,
  restoreZone,
  updateRow,
  updateVenue,
  type VenueInput,
  VenueInputError,
} from "@/server/services/venues";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let owner: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof VenueInputError) return error.code;
    throw error;
  }
  return null;
}

const venueInput = (patch: Partial<VenueInput> = {}): VenueInput => ({
  name: "Rheinwiese",
  kind: "outdoor_public",
  street: "Am Rhein 1",
  postalCode: "50667",
  city: "Köln",
  bundesland: "NW",
  lat: null,
  lng: null,
  capacityCm: null,
  accessInfo: null,
  landownerContactId: null,
  ...patch,
});

const rowInput = (patch: Partial<RowInput> = {}): RowInput => ({
  label: "A1",
  lengthCm: 1200,
  depthCm: 450,
  carAllowed: false,
  carSlots: 0,
  power: false,
  water: false,
  ...patch,
});

const auditsOf = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(auditLog.at);

async function landowner(name = "Familie Müller", kind: "landowner" | "authority" = "landowner") {
  const [row] = await db.insert(contact).values({ kind, name }).returning();
  if (!row) throw new Error("no contact");
  return row;
}

describe("createVenue", () => {
  it("stores the venue with the trimmed values and audits it", async () => {
    const owner1 = await landowner();
    const { id } = await createVenue(
      owner,
      venueInput({
        name: "  Rheinwiese   Süd ",
        street: " ",
        accessInfo: "  Zufahrt über Tor 2\nSchlüssel beim Hausmeister ",
        capacityCm: 45_000,
        lat: 50.9375,
        lng: 6.96,
        bundesland: "BY",
        landownerContactId: owner1.id,
      }),
    );
    const [row] = await db.select().from(venue).where(eq(venue.id, id));
    expect(row).toMatchObject({
      name: "Rheinwiese Süd",
      kind: "outdoor_public",
      street: null,
      postalCode: "50667",
      city: "Köln",
      bundesland: "BY",
      lat: 50.9375,
      lng: 6.96,
      capacityCm: 45_000,
      accessInfo: "Zufahrt über Tor 2\nSchlüssel beim Hausmeister",
      landownerContactId: owner1.id,
      archivedAt: null,
    });

    const [entry] = await auditsOf("venue.create");
    expect(entry).toMatchObject({ actorId: owner.id, entityType: "venue", entityId: id });
    expect(entry?.diff).toMatchObject({ values: { name: "Rheinwiese Süd", city: "Köln" } });
  });

  it.each([
    ["invalid_name", { name: "   " }],
    ["invalid_name", { name: "x".repeat(121) }],
    ["invalid_kind", { kind: "garage" }],
    ["invalid_street", { street: "x".repeat(121) }],
    ["invalid_postal_code", { postalCode: "5066" }],
    ["invalid_city", { city: "" }],
    ["invalid_bundesland", { bundesland: "XX" }],
    ["invalid_access_info", { accessInfo: "x".repeat(2001) }],
    ["invalid_capacity", { capacityCm: 0 }],
    ["invalid_capacity", { capacityCm: 12.5 }],
    ["invalid_capacity", { capacityCm: 1_000_001 }],
    ["invalid_coordinates", { lat: 50.9, lng: null }],
    ["invalid_coordinates", { lat: 95, lng: 6 }],
    ["invalid_coordinates", { lat: 50, lng: 200 }],
    ["invalid_landowner", { landownerContactId: "not-a-uuid" }],
  ] as const)("rejects with %s", async (code, patch) => {
    expect(await codeOf(createVenue(owner, venueInput(patch)))).toBe(code);
    expect(await db.select().from(venue)).toHaveLength(0);
    expect(await auditsOf("venue.create")).toHaveLength(0);
  });

  it("only takes a live landowner contact", async () => {
    const authority = await landowner("Stadt Köln", "authority");
    const gone = await landowner("Alt");
    await db.update(contact).set({ archivedAt: new Date() }).where(eq(contact.id, gone.id));
    for (const id of [authority.id, gone.id, "00000000-0000-4000-8000-000000000000"]) {
      expect(await codeOf(createVenue(owner, venueInput({ landownerContactId: id })))).toBe(
        "invalid_landowner",
      );
    }
  });

  it("needs venue:write", async () => {
    for (const role of ["staff", "field"] as const) {
      const actor = await createActor(role);
      await expect(createVenue(actor, venueInput())).rejects.toSatisfy(isForbidden);
    }
    const manager = await createActor("manager");
    await expect(createVenue(manager, venueInput())).resolves.toHaveProperty("id");
    expect(await db.select().from(venue)).toHaveLength(1);
  });
});

describe("updateVenue", () => {
  it("changes the venue and audits only the fields that changed", async () => {
    const { id } = await createVenue(owner, venueInput());
    const result = await updateVenue(
      owner,
      id,
      venueInput({ name: "Rheinwiese Nord", capacityCm: 30_000, accessInfo: "Tor 2" }),
    );
    expect(result.changed).toBe(true);
    const [row] = await db.select().from(venue).where(eq(venue.id, id));
    expect(row).toMatchObject({ name: "Rheinwiese Nord", capacityCm: 30_000, accessInfo: "Tor 2" });

    const [entry] = await auditsOf("venue.update");
    expect(entry?.entityId).toBe(id);
    expect(entry?.diff).toEqual({
      changes: {
        name: { from: "Rheinwiese", to: "Rheinwiese Nord" },
        capacityCm: { from: null, to: 30_000 },
        accessInfo: { from: null, to: "Tor 2" },
      },
    });
  });

  it("does nothing (and writes no audit entry) when nothing changed", async () => {
    const { id } = await createVenue(owner, venueInput());
    const result = await updateVenue(owner, id, venueInput({ name: "  Rheinwiese " }));
    expect(result.changed).toBe(false);
    expect(await auditsOf("venue.update")).toHaveLength(0);
  });

  it("validates, needs venue:write and ignores archived or unknown venues", async () => {
    const { id } = await createVenue(owner, venueInput());
    expect(await codeOf(updateVenue(owner, id, venueInput({ city: "" })))).toBe("invalid_city");
    const staff = await createActor("staff");
    await expect(updateVenue(staff, id, venueInput({ name: "X" }))).rejects.toSatisfy(isForbidden);
    expect(await codeOf(updateVenue(owner, "nope", venueInput()))).toBe("not_found");
    await archiveVenue(owner, id);
    expect(await codeOf(updateVenue(owner, id, venueInput({ name: "Y" })))).toBe("not_found");
  });

  it("lets an archived landowner stay but not be newly picked", async () => {
    const old = await landowner("Alt");
    const { id } = await createVenue(owner, venueInput({ landownerContactId: old.id }));
    await db.update(contact).set({ archivedAt: new Date() }).where(eq(contact.id, old.id));
    await expect(
      updateVenue(owner, id, venueInput({ name: "Neu", landownerContactId: old.id })),
    ).resolves.toEqual({ changed: true });
    const other = await createVenue(owner, venueInput({ name: "Zweiter Platz" }));
    expect(
      await codeOf(updateVenue(owner, other.id, venueInput({ landownerContactId: old.id }))),
    ).toBe("invalid_landowner");
    // The edit form still lists the venue's own (archived) landowner, others only if live.
    expect((await listLandownerOptions(old.id)).map((o) => o.id)).toEqual([old.id]);
    expect(await listLandownerOptions()).toEqual([]);
  });
});

describe("archiveVenue", () => {
  it("hides the venue from lists and pickers, keeps its events and can be undone", async () => {
    const cat = await seedCatalogue();
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
    if (!created) throw new Error("no event");
    const { id } = await createVenue(owner, venueInput());
    expect((await listVenues(owner, "2026-10-21")).map((v) => v.id)).toContain(id);
    expect((await listVenueOptions()).map((v) => v.id)).toContain(id);

    expect(await archiveVenue(owner, cat.venue.id)).toEqual({ name: "Messeplatz Test" });
    expect((await listVenues(owner, "2026-10-21")).map((v) => v.id)).not.toContain(cat.venue.id);
    expect((await listVenueOptions()).map((v) => v.id)).not.toContain(cat.venue.id);
    expect(await getVenue(cat.venue.id)).toBeNull();
    const [ev] = await db.select().from(event).where(eq(event.id, created.id));
    expect(ev?.venueId).toBe(cat.venue.id);
    const [entry] = await auditsOf("venue.archive");
    expect(entry).toMatchObject({ entityId: cat.venue.id, actorId: owner.id });

    await restoreVenue(owner, cat.venue.id);
    expect((await listVenues(owner, "2026-10-21")).map((v) => v.id)).toContain(cat.venue.id);
    expect(await auditsOf("venue.restore")).toHaveLength(1);
    // Restoring a venue that isn't archived is a conflict, not a silent success.
    expect(await codeOf(restoreVenue(owner, cat.venue.id))).toBe("conflict");
  });

  it("needs venue:delete", async () => {
    const { id } = await createVenue(owner, venueInput());
    const staff = await createActor("staff");
    await expect(archiveVenue(staff, id)).rejects.toSatisfy(isForbidden);
    await expect(restoreVenue(staff, id)).rejects.toSatisfy(isForbidden);
    expect(await codeOf(archiveVenue(owner, "00000000-0000-4000-8000-000000000000"))).toBe(
      "not_found",
    );
    expect(await codeOf(archiveVenue(owner, id))).toBeNull();
    expect(await codeOf(archiveVenue(owner, id))).toBe("not_found");
  });
});

describe("zones", () => {
  async function venueWithZones(...names: string[]) {
    const { id } = await createVenue(owner, venueInput());
    const ids: string[] = [];
    for (const name of names) ids.push((await createZone(owner, id, name)).id);
    return { venueId: id, ids };
  }
  const order = async (venueId: string) => (await getVenue(venueId))?.zones.map((z) => z.name);

  it("adds zones at the end and audits them", async () => {
    const { venueId, ids } = await venueWithZones("Nord", "  Süd  ", "Ost");
    expect(await order(venueId)).toEqual(["Nord", "Süd", "Ost"]);
    const sorts = await db.select({ sort: zone.sort }).from(zone).orderBy(zone.sort);
    expect(sorts.map((s) => s.sort)).toEqual([0, 1, 2]);
    const entries = await auditsOf("venue.zone.create");
    expect(entries.map((e) => e.entityId)).toEqual(ids);
    expect(entries[1]?.diff).toEqual({ venueId, name: "Süd", sort: 1 });
  });

  it("validates names, the venue and permission", async () => {
    const { venueId, ids } = await venueWithZones("Nord");
    expect(await codeOf(createZone(owner, venueId, "  "))).toBe("invalid_zone_name");
    expect(await codeOf(createZone(owner, venueId, "x".repeat(61)))).toBe("invalid_zone_name");
    expect(await codeOf(renameZone(owner, ids[0] as string, ""))).toBe("invalid_zone_name");
    expect(await codeOf(createZone(owner, "00000000-0000-4000-8000-000000000000", "A"))).toBe(
      "not_found",
    );
    const staff = await createActor("staff");
    await expect(createZone(staff, venueId, "A")).rejects.toSatisfy(isForbidden);
    await expect(renameZone(staff, ids[0] as string, "A")).rejects.toSatisfy(isForbidden);
    await expect(moveZone(staff, ids[0] as string, "down")).rejects.toSatisfy(isForbidden);
    await expect(deleteZone(staff, ids[0] as string)).rejects.toSatisfy(isForbidden);
    await archiveVenue(owner, venueId);
    expect(await codeOf(createZone(owner, venueId, "A"))).toBe("not_found");
  });

  it("renames and audits the change", async () => {
    const { ids } = await venueWithZones("Nord");
    const id = ids[0] as string;
    expect(await renameZone(owner, id, " Nordwiese ")).toEqual({ changed: true });
    expect(await renameZone(owner, id, "Nordwiese")).toEqual({ changed: false });
    const [entry] = await auditsOf("venue.zone.update");
    expect(entry?.diff).toMatchObject({ changes: { name: { from: "Nord", to: "Nordwiese" } } });
    expect(await auditsOf("venue.zone.update")).toHaveLength(1);
  });

  it("moves a zone up and down, stops at the ends and numbers the zones cleanly", async () => {
    const { venueId, ids } = await venueWithZones("A", "B", "C");
    const [a, b, c] = ids as [string, string, string];
    expect(await moveZone(owner, c, "up")).toEqual({ changed: true, position: 2, count: 3 });
    expect(await order(venueId)).toEqual(["A", "C", "B"]);
    expect(await moveZone(owner, a, "up")).toEqual({ changed: false, position: 1, count: 3 });
    expect(await moveZone(owner, b, "down")).toEqual({ changed: false, position: 3, count: 3 });
    expect(await moveZone(owner, a, "down")).toMatchObject({ changed: true, position: 2 });
    expect(await order(venueId)).toEqual(["C", "A", "B"]);
    expect(await codeOf(moveZone(owner, a, "sideways"))).toBe("invalid_direction");
    const [entry] = await auditsOf("venue.zone.move");
    expect(entry?.diff).toEqual({ venueId, name: "C", from: 3, to: 2 });
  });

  it("moves zones whose sort numbers are tied (older data)", async () => {
    const { venueId, ids } = await venueWithZones("A", "B", "C");
    await db.update(zone).set({ sort: 0 }).where(eq(zone.venueId, venueId));
    // Tied sorts show in name order: A, B, C. Moving C up gives A, C, B.
    await moveZone(owner, ids[2] as string, "up");
    expect(await order(venueId)).toEqual(["A", "C", "B"]);
    const sorts = await db.select({ name: zone.name, sort: zone.sort }).from(zone);
    expect(Object.fromEntries(sorts.map((s) => [s.name, s.sort]))).toEqual({ A: 0, C: 1, B: 2 });
  });

  it("deletes a zone with its rows and brings both back on undo", async () => {
    const { venueId, ids } = await venueWithZones("Nord", "Süd");
    const zoneId = ids[0] as string;
    const r1 = await createRow(owner, zoneId, rowInput({ label: "N1", power: true }));
    const r2 = await createRow(
      owner,
      zoneId,
      rowInput({ label: "N2", carAllowed: true, carSlots: 2 }),
    );

    expect(await deleteZone(owner, zoneId)).toEqual({ name: "Nord", rowCount: 2 });
    expect(await order(venueId)).toEqual(["Süd"]);
    expect(await db.select().from(venueRow)).toHaveLength(0);
    const [entry] = await auditsOf("venue.zone.delete");
    expect(entry?.diff).toMatchObject({ venueId, name: "Nord", rowCount: 2 });

    expect(await restoreZone(owner, zoneId)).toEqual({ name: "Nord", rowCount: 2 });
    expect(await order(venueId)).toEqual(["Nord", "Süd"]);
    const detail = await getVenue(venueId);
    const rows = detail?.zones[0]?.rows ?? [];
    expect(rows.map((r) => r.id)).toEqual([r1.id, r2.id]);
    expect(rows[0]).toMatchObject({ label: "N1", lengthCm: 1200, power: true });
    expect(rows[1]).toMatchObject({ carAllowed: true, carSlots: 2 });
    expect(await auditsOf("venue.zone.restore")).toHaveLength(1);
    // A second undo finds the zone again: conflict, nothing duplicated.
    expect(await codeOf(restoreZone(owner, zoneId))).toBe("conflict");
    expect(await db.select().from(zone)).toHaveLength(2);
  });

  it("can't restore what was never deleted, or into an archived venue", async () => {
    const { venueId, ids } = await venueWithZones("Nord");
    const zoneId = ids[0] as string;
    expect(await codeOf(restoreZone(owner, zoneId))).toBe("nothing_to_restore");
    expect(await codeOf(restoreZone(owner, "nope"))).toBe("nothing_to_restore");
    await deleteZone(owner, zoneId);
    await archiveVenue(owner, venueId);
    expect(await codeOf(restoreZone(owner, zoneId))).toBe("not_found");
  });

  it("only restores recent deletes", async () => {
    const { ids } = await venueWithZones("Nord");
    const zoneId = ids[0] as string;
    await deleteZone(owner, zoneId);
    await db
      .update(auditLog)
      .set({ at: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(auditLog.action, "venue.zone.delete"));
    expect(await codeOf(restoreZone(owner, zoneId))).toBe("nothing_to_restore");
  });
});

describe("rows", () => {
  async function oneZone() {
    const { id: venueId } = await createVenue(owner, venueInput());
    const { id: zoneId } = await createZone(owner, venueId, "Nord");
    return { venueId, zoneId };
  }
  const rowsOf = async (venueId: string) => (await getVenue(venueId))?.zones[0]?.rows ?? [];

  it("adds rows at the end of the zone and audits them", async () => {
    const { venueId, zoneId } = await oneZone();
    const a = await createRow(owner, zoneId, rowInput({ label: " Reihe  A " }));
    const b = await createRow(
      owner,
      zoneId,
      rowInput({
        label: "B",
        lengthCm: 805,
        depthCm: 300,
        carAllowed: true,
        carSlots: 3,
        water: true,
      }),
    );
    const rows = await rowsOf(venueId);
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(rows[0]?.label).toBe("Reihe A");
    expect(rows[1]).toMatchObject({
      lengthCm: 805,
      depthCm: 300,
      carAllowed: true,
      carSlots: 3,
      water: true,
      power: false,
    });
    const [entry] = await auditsOf("venue.row.create");
    expect(entry).toMatchObject({ entityType: "row", entityId: a.id });
    expect(entry?.diff).toMatchObject({ venueId, zoneId, zoneName: "Nord" });
    // The venue's capacity follows the rows.
    expect((await getVenue(venueId))?.capacityCm).toBe(1200 + 805);
  });

  it("stores no car slots when cars aren't allowed", async () => {
    const { venueId, zoneId } = await oneZone();
    await createRow(owner, zoneId, rowInput({ carAllowed: false, carSlots: 4 }));
    expect((await rowsOf(venueId))[0]).toMatchObject({ carAllowed: false, carSlots: 0 });
  });

  it.each([
    ["invalid_row_label", { label: " " }],
    ["invalid_row_label", { label: "x".repeat(41) }],
    ["invalid_length", { lengthCm: 0 }],
    ["invalid_length", { lengthCm: 10.5 }],
    ["invalid_length", { lengthCm: 1_000_001 }],
    ["invalid_depth", { depthCm: -5 }],
    ["invalid_car_slots", { carAllowed: true, carSlots: -1 }],
    ["invalid_car_slots", { carAllowed: true, carSlots: 1000 }],
    ["invalid_car_slots", { carAllowed: true, carSlots: 1.5 }],
  ] as const)("rejects with %s", async (code, patch) => {
    const { zoneId } = await oneZone();
    expect(await codeOf(createRow(owner, zoneId, rowInput(patch)))).toBe(code);
    expect(await db.select().from(venueRow)).toHaveLength(0);
  });

  it("needs venue:write and an existing zone", async () => {
    const { zoneId } = await oneZone();
    const staff = await createActor("staff");
    await expect(createRow(staff, zoneId, rowInput())).rejects.toSatisfy(isForbidden);
    expect(await codeOf(createRow(owner, "00000000-0000-4000-8000-000000000000", rowInput()))).toBe(
      "not_found",
    );
    const { id } = await createRow(owner, zoneId, rowInput());
    await expect(updateRow(staff, id, rowInput({ label: "X" }))).rejects.toSatisfy(isForbidden);
    await expect(deleteRow(staff, id)).rejects.toSatisfy(isForbidden);
    await expect(restoreRow(staff, id)).rejects.toSatisfy(isForbidden);
  });

  it("edits a row and audits what changed", async () => {
    const { venueId, zoneId } = await oneZone();
    const { id } = await createRow(owner, zoneId, rowInput());
    const result = await updateRow(
      owner,
      id,
      rowInput({ lengthCm: 1500, power: true, carAllowed: true, carSlots: 2 }),
    );
    expect(result).toEqual({ changed: true });
    expect((await rowsOf(venueId))[0]).toMatchObject({
      lengthCm: 1500,
      power: true,
      carAllowed: true,
      carSlots: 2,
    });
    const [entry] = await auditsOf("venue.row.update");
    expect(entry?.diff).toEqual({
      venueId,
      zoneId,
      changes: {
        lengthCm: { from: 1200, to: 1500 },
        carAllowed: { from: false, to: true },
        carSlots: { from: 0, to: 2 },
        power: { from: false, to: true },
      },
    });
    expect(
      await updateRow(
        owner,
        id,
        rowInput({ lengthCm: 1500, power: true, carAllowed: true, carSlots: 2 }),
      ),
    ).toEqual({
      changed: false,
    });
    expect(await auditsOf("venue.row.update")).toHaveLength(1);
    expect(await codeOf(updateRow(owner, id, rowInput({ depthCm: 0 })))).toBe("invalid_depth");
    expect(await codeOf(updateRow(owner, "nope", rowInput()))).toBe("not_found");
  });

  it("deletes a row and brings it back on undo", async () => {
    const { venueId, zoneId } = await oneZone();
    const a = await createRow(owner, zoneId, rowInput({ label: "A", water: true }));
    const b = await createRow(owner, zoneId, rowInput({ label: "B" }));
    expect(await deleteRow(owner, a.id)).toEqual({ label: "A" });
    expect((await rowsOf(venueId)).map((r) => r.id)).toEqual([b.id]);
    const [entry] = await auditsOf("venue.row.delete");
    expect(entry?.diff).toMatchObject({ venueId, zoneId, label: "A" });

    expect(await restoreRow(owner, a.id)).toEqual({ label: "A" });
    // Same place as before: the original sort number is kept.
    expect((await rowsOf(venueId)).map((r) => r.id)).toEqual([a.id, b.id]);
    expect((await rowsOf(venueId))[0]).toMatchObject({ label: "A", water: true });
    expect(await auditsOf("venue.row.restore")).toHaveLength(1);
    expect(await codeOf(restoreRow(owner, a.id))).toBe("conflict");
    expect(await codeOf(restoreRow(owner, b.id))).toBe("nothing_to_restore");
  });

  it("can't restore a row whose zone is gone", async () => {
    const { zoneId } = await oneZone();
    const { id } = await createRow(owner, zoneId, rowInput());
    await deleteRow(owner, id);
    await deleteZone(owner, zoneId);
    expect(await codeOf(restoreRow(owner, id))).toBe("not_found");
  });
});

describe("queries", () => {
  it("reads the stored values for the edit form, with the row total beside them", async () => {
    const { id } = await createVenue(
      owner,
      venueInput({ capacityCm: 20_000, lat: 50.5, lng: 7.25 }),
    );
    const { id: zoneId } = await createZone(owner, id, "Nord");
    await createRow(owner, zoneId, rowInput({ lengthCm: 1000 }));
    await createRow(owner, zoneId, rowInput({ label: "A2", lengthCm: 550 }));
    expect(await getVenueForEdit(id)).toMatchObject({
      name: "Rheinwiese",
      bundesland: "NW",
      lat: 50.5,
      lng: 7.25,
      capacityCm: 20_000,
      rowLengthCm: 1550,
    });
    expect(await getVenueForEdit("nope")).toBeNull();
    await archiveVenue(owner, id);
    expect(await getVenueForEdit(id)).toBeNull();
  });

  it("lists landowner contacts only", async () => {
    const a = await landowner("Bauer Anders");
    await landowner("Stadt Köln", "authority");
    expect((await listLandownerOptions()).map((o) => o.id)).toEqual([a.id]);
  });
});
