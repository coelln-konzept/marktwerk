import { auditLog, event, eventPreset, eventType, staffMember, venue } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import {
  createPreset,
  type PresetInput,
  PresetInputError,
  updatePreset,
} from "@/server/services/presets";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const input = (patch: Partial<PresetInput> = {}): PresetInput => ({
  name: "Frühjahrsmarkt",
  eventTypeId: cat.type.id,
  venueId: cat.venue.id,
  durationDays: 1,
  publicTitle: "Frühjahrs-Flohmarkt",
  publicText: "Trödeln im Park.",
  times: { setup: "6", open: "8.00", close: "16:00", teardown: "18:00" },
  pricePerMCents: 1500,
  bookingFeeCents: 500,
  rrule: "FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=1",
  defaultDuties: { market_lead: cat.staff.anna.id },
  active: true,
  ...patch,
});

const rejects = async (promise: Promise<unknown>, code: string, field?: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PresetInputError);
  expect((error as PresetInputError).code).toBe(code);
  if (field !== undefined) expect((error as PresetInputError).field).toBe(field);
};

const load = async (id: string) => {
  const [row] = await db.select().from(eventPreset).where(eq(eventPreset.id, id));
  if (!row) throw new Error("preset missing");
  return row;
};

const audits = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(auditLog.at);

describe("createPreset", () => {
  it("stores the preset with normalised times and a unique key", async () => {
    const { id, key } = await createPreset(owner, input());
    expect(key).toMatch(/^fruehjahrsmarkt-[0-9a-f]{6}$/);
    const row = await load(id);
    expect(row).toMatchObject({
      key,
      name: "Frühjahrsmarkt",
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      publicTitle: "Frühjahrs-Flohmarkt",
      publicText: "Trödeln im Park.",
      pricePerMCents: 1500,
      bookingFeeCents: 500,
      rrule: "FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=1",
      durationDays: 1,
      defaultDuties: { market_lead: cat.staff.anna.id },
      active: true,
      archivedAt: null,
    });
    expect(row.defaultTimes).toEqual({
      setup: "06:00",
      open: "08:00",
      close: "16:00",
      teardown: "18:00",
    });
  });

  it("gives presets with the same name different keys, trims, and turns blank texts into null", async () => {
    const a = await createPreset(
      owner,
      input({ name: "  Doppelt  ", publicTitle: "   ", publicText: "" }),
    );
    const b = await createPreset(owner, input({ name: "Doppelt" }));
    expect(a.key).not.toBe(b.key);
    const row = await load(a.id);
    expect(row).toMatchObject({ name: "Doppelt", publicTitle: null, publicText: null });
  });

  it("accepts a preset without rhythm and without default team", async () => {
    const { id } = await createPreset(owner, input({ rrule: null, defaultDuties: {} }));
    expect(await load(id)).toMatchObject({ rrule: null, defaultDuties: {} });
  });

  it("audits preset.create with every field as a change from nothing", async () => {
    const { id, key } = await createPreset(owner, input());
    const [entry] = await audits("preset.create");
    expect(entry).toMatchObject({ actorId: owner.id, entityType: "event_preset", entityId: id });
    const diff = entry?.diff as {
      key: string;
      changes: Record<string, { from: unknown; to: unknown }>;
    };
    expect(diff.key).toBe(key);
    expect(diff.changes.name).toEqual({ from: null, to: "Frühjahrsmarkt" });
    expect(diff.changes.pricePerMCents).toEqual({ from: null, to: 1500 });
    expect(diff.changes.defaultTimes?.to).toEqual({
      setup: "06:00",
      open: "08:00",
      close: "16:00",
      teardown: "18:00",
    });
  });
});

describe("validation", () => {
  it("rejects bad names", async () => {
    await rejects(createPreset(owner, input({ name: "  " })), "invalid_name", "name");
    await rejects(createPreset(owner, input({ name: "x".repeat(121) })), "invalid_name", "name");
    await createPreset(owner, input({ name: "x".repeat(120) }));
  });

  it("rejects durations outside 1–14 days", async () => {
    await rejects(createPreset(owner, input({ durationDays: 0 })), "invalid_duration", "duration");
    await rejects(createPreset(owner, input({ durationDays: 15 })), "invalid_duration", "duration");
    await createPreset(owner, input({ durationDays: 14 }));
  });

  it("names the time field that is wrong", async () => {
    await rejects(
      createPreset(
        owner,
        input({ times: { setup: "06:00", open: "08:00", close: "16:00", teardown: "25:00" } }),
      ),
      "invalid_time",
      "teardown",
    );
    await rejects(
      createPreset(
        owner,
        input({ times: { setup: "06:00", open: "17:00", close: "16:00", teardown: "18:00" } }),
      ),
      "open_after_close",
      "close",
    );
    await rejects(
      createPreset(
        owner,
        input({ times: { setup: "06:00", open: "08:00", close: "19:00", teardown: "18:00" } }),
      ),
      "close_after_teardown",
      "teardown",
    );
    // A late setup is fine for multi-day presets (set up the day before), not for single-day ones.
    const late = { setup: "09:00", open: "08:00", close: "16:00", teardown: "18:00" };
    await rejects(createPreset(owner, input({ times: late })), "setup_after_open", "setup");
    await createPreset(owner, input({ times: late, durationDays: 3 }));
  });

  it("limits prices to 0 – 1.000.000 cents", async () => {
    await rejects(createPreset(owner, input({ pricePerMCents: -1 })), "invalid_price", "price");
    await rejects(
      createPreset(owner, input({ pricePerMCents: 1_000_001 })),
      "invalid_price",
      "price",
    );
    await rejects(createPreset(owner, input({ bookingFeeCents: 12.5 })), "invalid_fee", "fee");
    await createPreset(owner, input({ pricePerMCents: 0, bookingFeeCents: 1_000_000 }));
  });

  it("rejects rules that do not parse", async () => {
    await rejects(
      createPreset(owner, input({ rrule: "FREQ=WEEKLY;BYDAY=SU" })),
      "invalid_rrule",
      "rrule",
    );
    await rejects(createPreset(owner, input({ rrule: "garbage" })), "invalid_rrule", "rrule");
  });

  it("rejects unknown or archived types and venues", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    await rejects(createPreset(owner, input({ eventTypeId: missing })), "invalid_type", "type");
    await rejects(createPreset(owner, input({ eventTypeId: "nope" })), "invalid_type", "type");
    await rejects(createPreset(owner, input({ venueId: missing })), "invalid_venue", "venue");

    await db.update(venue).set({ archivedAt: new Date() }).where(eq(venue.id, cat.venue.id));
    await rejects(createPreset(owner, input()), "invalid_venue", "venue");
    await db.update(venue).set({ archivedAt: null }).where(eq(venue.id, cat.venue.id));
    await db.update(eventType).set({ archivedAt: new Date() }).where(eq(eventType.id, cat.type.id));
    await rejects(createPreset(owner, input()), "invalid_type", "type");
  });

  it("rejects unknown duty roles and unknown or inactive staff", async () => {
    await rejects(
      createPreset(owner, input({ defaultDuties: { ghost: cat.staff.anna.id } })),
      "invalid_duty_role",
      "duty.ghost",
    );
    await rejects(
      createPreset(
        owner,
        input({ defaultDuties: { setup: "00000000-0000-4000-8000-000000000000" } }),
      ),
      "invalid_staff",
      "duty.setup",
    );
    await db.update(staffMember).set({ active: false }).where(eq(staffMember.id, cat.staff.ben.id));
    await rejects(
      createPreset(owner, input({ defaultDuties: { setup: cat.staff.ben.id } })),
      "invalid_staff",
      "duty.setup",
    );
  });

  it("saves nothing when validation fails", async () => {
    await rejects(createPreset(owner, input({ name: "" })), "invalid_name");
    const rows = await db.select({ id: eventPreset.id }).from(eventPreset);
    expect(rows).toHaveLength(2); // the two seeded presets
    expect(await audits("preset.create")).toHaveLength(0);
  });
});

describe("updatePreset", () => {
  it("changes the fields, bumps updated_at and audits only what changed", async () => {
    const before = await load(cat.presets.flea.id);
    const result = await updatePreset(
      owner,
      before.id,
      input({
        name: "Testflohmarkt",
        pricePerMCents: 1300,
        bookingFeeCents: before.bookingFeeCents,
        times: before.defaultTimes,
        rrule: null,
        defaultDuties: before.defaultDuties,
        publicTitle: null,
        publicText: null,
        durationDays: before.durationDays,
      }),
      before.updatedAt,
    );
    expect(result.changed).toBe(true);
    expect(result.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

    const after = await load(before.id);
    expect(after.pricePerMCents).toBe(1300);
    expect(after.key).toBe(before.key);
    expect(after.updatedAt.getTime()).toBe(result.updatedAt.getTime());

    const [entry] = await audits("preset.update");
    expect(entry).toMatchObject({
      actorId: owner.id,
      entityType: "event_preset",
      entityId: before.id,
    });
    expect(entry?.diff).toEqual({
      changes: { pricePerMCents: { from: 1200, to: 1300 } },
    });
  });

  it("edits the default team, rhythm, times and active flag", async () => {
    const before = await load(cat.presets.festival.id);
    await updatePreset(
      owner,
      before.id,
      input({
        name: before.name,
        durationDays: 3,
        publicTitle: null,
        publicText: null,
        pricePerMCents: before.pricePerMCents,
        bookingFeeCents: before.bookingFeeCents,
        defaultDuties: { market_lead: cat.staff.ben.id, setup: cat.staff.anna.id },
        times: { setup: "07:30", open: "10:00", close: "22:00", teardown: "23:30" },
        active: false,
      }),
      before.updatedAt,
    );
    const after = await load(before.id);
    expect(after).toMatchObject({
      active: false,
      rrule: "FREQ=MONTHLY;BYMONTH=4,5;BYDAY=SU;BYSETPOS=1",
      defaultDuties: { market_lead: cat.staff.ben.id, setup: cat.staff.anna.id },
    });
    expect(after.defaultTimes.setup).toBe("07:30");
    const [entry] = await audits("preset.update");
    const changes =
      (entry?.diff as { changes: Record<string, unknown> } | undefined)?.changes ?? {};
    expect(Object.keys(changes).sort()).toEqual([
      "active",
      "defaultDuties",
      "defaultTimes",
      "rrule",
    ]);
  });

  it("reactivating an inactive preset is just another update", async () => {
    const before = await load(cat.presets.flea.id);
    const off = await updatePreset(
      owner,
      before.id,
      same(before, { active: false }),
      before.updatedAt,
    );
    const mid = await load(before.id);
    await updatePreset(owner, before.id, same(mid, { active: true }), off.updatedAt);
    expect((await load(before.id)).active).toBe(true);
    expect(await audits("preset.update")).toHaveLength(2);
  });

  it("does nothing, and audits nothing, when nothing changed", async () => {
    const before = await load(cat.presets.flea.id);
    const result = await updatePreset(owner, before.id, same(before), before.updatedAt);
    expect(result.changed).toBe(false);
    expect((await load(before.id)).updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await audits("preset.update")).toHaveLength(0);
  });

  it("refuses with conflict when the preset changed since the form was loaded", async () => {
    const loaded = await load(cat.presets.flea.id);
    await updatePreset(owner, loaded.id, same(loaded, { pricePerMCents: 1400 }), loaded.updatedAt);
    // A second editor still holds the old version.
    await rejects(
      updatePreset(owner, loaded.id, same(loaded, { pricePerMCents: 1600 }), loaded.updatedAt),
      "conflict",
    );
    expect((await load(loaded.id)).pricePerMCents).toBe(1400);
    expect(await audits("preset.update")).toHaveLength(1);
    // Accepts the ISO string a form sends.
    const fresh = await load(loaded.id);
    await updatePreset(
      owner,
      loaded.id,
      same(fresh, { pricePerMCents: 1600 }),
      fresh.updatedAt.toISOString(),
    );
    expect((await load(loaded.id)).pricePerMCents).toBe(1600);
  });

  it("reports unknown, malformed and archived presets as not_found", async () => {
    const row = await load(cat.presets.flea.id);
    await rejects(
      updatePreset(owner, "00000000-0000-4000-8000-000000000000", same(row), row.updatedAt),
      "not_found",
    );
    await rejects(updatePreset(owner, "nope", same(row), row.updatedAt), "not_found");
    await db.update(eventPreset).set({ archivedAt: new Date() }).where(eq(eventPreset.id, row.id));
    const archived = await load(row.id);
    await rejects(updatePreset(owner, row.id, same(row), archived.updatedAt), "not_found");
  });

  it("validates like create, and keeps the old values on failure", async () => {
    const row = await load(cat.presets.flea.id);
    await rejects(
      updatePreset(owner, row.id, same(row, { name: "" }), row.updatedAt),
      "invalid_name",
      "name",
    );
    await rejects(
      updatePreset(owner, row.id, same(row, { rrule: "nonsense" }), row.updatedAt),
      "invalid_rrule",
      "rrule",
    );
    expect((await load(row.id)).name).toBe("Testflohmarkt");
  });

  it("keeps an archived venue, an inactive person and an archived type the preset already has", async () => {
    const row = await load(cat.presets.flea.id);
    await db.update(venue).set({ archivedAt: new Date() }).where(eq(venue.id, cat.venue.id));
    await db.update(eventType).set({ archivedAt: new Date() }).where(eq(eventType.id, cat.type.id));
    await db
      .update(staffMember)
      .set({ active: false })
      .where(eq(staffMember.id, cat.staff.anna.id));
    const result = await updatePreset(
      owner,
      row.id,
      same(row, {
        name: "Umbenannt",
        defaultDuties: { market_lead: cat.staff.anna.id, setup: cat.staff.ben.id },
      }),
      row.updatedAt,
    );
    expect(result.changed).toBe(true);

    // Another preset cannot newly pick the archived venue or the inactive person.
    const other = await load(cat.presets.festival.id);
    await rejects(
      updatePreset(
        owner,
        other.id,
        same(other, { defaultDuties: { market_lead: cat.staff.anna.id } }),
        other.updatedAt,
      ),
      "invalid_staff",
      "duty.market_lead",
    );
  });
});

describe("permissions", () => {
  it("lets managers write, but not staff or field users", async () => {
    const manager = await createActor("manager");
    await createPreset(manager, input());

    const row = await load(cat.presets.flea.id);
    for (const role of ["staff", "field"] as const) {
      const actor = await createActor(role);
      await expect(createPreset(actor, input())).rejects.toSatisfy(isForbidden);
      await expect(
        updatePreset(actor, row.id, same(row, { name: "Hacked" }), row.updatedAt),
      ).rejects.toSatisfy(isForbidden);
    }
    expect((await load(row.id)).name).toBe("Testflohmarkt");
    expect(await audits("preset.create")).toHaveLength(1);
    expect(await audits("preset.update")).toHaveLength(0);
  });
});

describe("existing events", () => {
  it("are never touched by creating or editing a preset", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
    if (!created) throw new Error("no event");
    const snapshot = async () => {
      const [row] = await db.select().from(event).where(eq(event.id, created.id));
      return row;
    };
    const before = await snapshot();

    const preset = await load(cat.presets.flea.id);
    await updatePreset(
      owner,
      preset.id,
      same(preset, {
        name: "Ganz anders",
        venueId: cat.venue.id,
        durationDays: 5,
        pricePerMCents: 9900,
        bookingFeeCents: 900,
        times: { setup: "04:00", open: "09:00", close: "20:00", teardown: "22:00" },
        defaultDuties: {},
      }),
      preset.updatedAt,
    );
    await createPreset(owner, input({ name: "Noch eine" }));

    expect(await snapshot()).toEqual(before);
    expect(before).toMatchObject({
      name: "Testflohmarkt",
      pricePerMCents: 1200,
      bookingFeeCents: 500,
    });
  });
});

/** A stored preset as form input, with some fields changed. */
function same(row: typeof eventPreset.$inferSelect, patch: Partial<PresetInput> = {}): PresetInput {
  return {
    name: row.name,
    eventTypeId: row.eventTypeId,
    venueId: row.venueId,
    durationDays: row.durationDays,
    publicTitle: row.publicTitle,
    publicText: row.publicText,
    times: row.defaultTimes,
    pricePerMCents: row.pricePerMCents,
    bookingFeeCents: row.bookingFeeCents,
    rrule: row.rrule,
    defaultDuties: row.defaultDuties,
    active: row.active,
    ...patch,
  };
}
