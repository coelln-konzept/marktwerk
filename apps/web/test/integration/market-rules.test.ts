import { readFileSync } from "node:fs";
import type { MarketRules } from "@marktwerk/core";
import { auditLog, eventPreset, eventType } from "@marktwerk/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getEvent } from "@/server/queries/events";
import { createEventsFromPreset } from "@/server/services/events";
import {
  createMarket,
  createPreset,
  PresetInputError,
  updateMarketRules,
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

const rejects = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PresetInputError);
  expect((error as PresetInputError).code).toBe(code);
};

const rulesOf = async (presetId: string) => {
  const [row] = await db
    .select({ rules: eventPreset.rules })
    .from(eventPreset)
    .where(eq(eventPreset.id, presetId));
  if (!row) throw new Error("preset missing");
  return row.rules;
};

const audits = () =>
  db.select().from(auditLog).where(eq(auditLog.action, "preset.rules")).orderBy(auditLog.at);

const edited = (): MarketRules => ({
  ...cat.type.rules,
  newGoodsMaxShare: 0.1,
  bannedGoods: [" Waffen ", "Tiere", "waffen", ""],
  onlineBookingAllowed: false,
});

describe("event_preset.rules", () => {
  it("a new preset starts with a copy of its event type's rules", async () => {
    const { id } = await createPreset(owner, {
      name: "Frühjahrsmarkt",
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      durationDays: 1,
      publicTitle: null,
      publicText: null,
      times: { setup: "06:00", open: "08:00", close: "16:00", teardown: "18:00" },
      pricePerMCents: 1500,
      bookingFeeCents: 500,
      rrule: null,
      defaultDuties: {},
      active: true,
    });
    expect(await rulesOf(id)).toEqual(cat.type.rules);

    const market = await createMarket(owner, {
      name: "Herbstmarkt",
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      times: { setup: "06:00", open: "08:00", close: "16:00", teardown: "18:00" },
      pricePerMCents: 1500,
      bookingFeeCents: 500,
      rrule: null,
    });
    expect(await rulesOf(market.id)).toEqual(cat.type.rules);

    // A copy: changing the type afterwards leaves the market's rules alone.
    await db
      .update(eventType)
      .set({ rules: { ...cat.type.rules, newGoodsMaxShare: 0.5 } })
      .where(eq(eventType.id, cat.type.id));
    expect(await rulesOf(market.id)).toEqual(cat.type.rules);
  });

  it("the migration fills each preset with its event type's rules", async () => {
    await db
      .update(eventType)
      .set({ rules: { ...cat.type.rules, bannedGoods: ["Feuerwerk"] } })
      .where(eq(eventType.id, cat.type.id));
    await db
      .update(eventPreset)
      .set({ rules: { ...cat.type.rules, newGoodsMaxShare: 0.9 } })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    const file = new URL("../../../../packages/db/drizzle/0015_preset_rules.sql", import.meta.url);
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((part) =>
        part
          .split("\n")
          .filter((line) => !line.startsWith("--"))
          .join("\n")
          .trim(),
      );
    const backfill = statements.find((statement) => statement.startsWith("UPDATE"));
    expect(backfill).toBeDefined();
    await db.execute(sql.raw(backfill as string));
    const expected = { ...cat.type.rules, bannedGoods: ["Feuerwerk"] };
    expect(await rulesOf(cat.presets.flea.id)).toEqual(expected);
    expect(await rulesOf(cat.presets.festival.id)).toEqual(expected);
  });
});

describe("updateMarketRules", () => {
  it("saves normalised rules and audits before/after; the type stays", async () => {
    const before = await rulesOf(cat.presets.flea.id);
    const result = await updateMarketRules(owner, cat.presets.flea.id, edited());
    const saved = { ...cat.type.rules, newGoodsMaxShare: 0.1, bannedGoods: ["Waffen", "Tiere"] };
    saved.onlineBookingAllowed = false;
    expect(result).toEqual({ changed: true, previous: before, rules: saved });
    expect(await rulesOf(cat.presets.flea.id)).toEqual(saved);
    // Only this market; the other one and the event type keep theirs.
    expect(await rulesOf(cat.presets.festival.id)).toEqual(cat.type.rules);
    const [type] = await db.select().from(eventType).where(eq(eventType.id, cat.type.id));
    expect(type?.rules).toEqual(cat.type.rules);

    const [entry] = await audits();
    expect(entry).toMatchObject({
      actorId: owner.id,
      entityType: "event_preset",
      entityId: cat.presets.flea.id,
      diff: { from: before, to: saved },
    });
  });

  it("does nothing when the rules are unchanged", async () => {
    const result = await updateMarketRules(owner, cat.presets.flea.id, {
      ...cat.type.rules,
      bannedGoods: [...cat.type.rules.bannedGoods, "  "],
    });
    expect(result.changed).toBe(false);
    expect(await audits()).toHaveLength(0);
  });

  it("undo restores the previous rules only while the saved ones are still there", async () => {
    const { previous, rules } = await updateMarketRules(owner, cat.presets.flea.id, edited());
    const undone = await updateMarketRules(owner, cat.presets.flea.id, previous, rules);
    expect(undone.changed).toBe(true);
    expect(await rulesOf(cat.presets.flea.id)).toEqual(cat.type.rules);
    const entries = await audits();
    expect(entries).toHaveLength(2);
    expect(entries[1]?.diff).toMatchObject({ undo: true });

    // A second undo finds other rules than it expects: nothing is reverted.
    await rejects(updateMarketRules(owner, cat.presets.flea.id, previous, rules), "conflict");
    expect(await rulesOf(cat.presets.flea.id)).toEqual(cat.type.rules);
  });

  it("rejects invalid rules and unknown or archived markets", async () => {
    await rejects(
      updateMarketRules(owner, cat.presets.flea.id, { ...edited(), newGoodsMaxShare: 1.5 }),
      "invalid_share",
    );
    await rejects(
      updateMarketRules(owner, cat.presets.flea.id, {
        ...edited(),
        bannedGoods: ["x".repeat(101)],
      }),
      "invalid_banned_goods",
    );
    await rejects(
      updateMarketRules(owner, cat.presets.flea.id, null as unknown as MarketRules),
      "invalid_input",
    );
    await rejects(updateMarketRules(owner, "nope", edited()), "not_found");
    await rejects(
      updateMarketRules(owner, "00000000-0000-4000-8000-000000000000", edited()),
      "not_found",
    );
    await db
      .update(eventPreset)
      .set({ archivedAt: new Date() })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    await rejects(updateMarketRules(owner, cat.presets.flea.id, edited()), "not_found");
    expect(await audits()).toHaveLength(0);
  });

  it("needs template:write (owner and manager, not staff or field)", async () => {
    const manager = await createActor("manager");
    await expect(updateMarketRules(manager, cat.presets.flea.id, edited())).resolves.toMatchObject({
      changed: true,
    });
    for (const role of ["staff", "field"] as const) {
      const actor = await createActor(role);
      const error = await updateMarketRules(actor, cat.presets.flea.id, {
        ...edited(),
        newGoodsMaxShare: 0.3,
      }).catch((e: unknown) => e);
      expect(isForbidden(error)).toBe(true);
    }
    expect(await audits()).toHaveLength(1);
  });

  it("the event page reads the market's rules", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    if (!created) throw new Error("event missing");
    await updateMarketRules(owner, cat.presets.flea.id, edited());
    const detail = await getEvent(owner, created.id);
    expect(detail?.preset?.rules.bannedGoods).toEqual(["Waffen", "Tiere"]);
    expect(detail?.type.rules).toEqual(cat.type.rules);
  });
});
