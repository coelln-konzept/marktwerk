import { type Role, scheduleFromTimes } from "@marktwerk/core";
import { dutyRole, eventPreset, eventType, staffMember, user, venue } from "@marktwerk/db/schema";
import { sql } from "drizzle-orm";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { assertTestDatabase, TEST_DATABASE_URL } from "./test-db-url";

/** Empties every table in the `app` schema. Only ever runs against a database named *_test. */
export async function resetDatabase() {
  assertTestDatabase(TEST_DATABASE_URL);
  const { rows } = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'app'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"app"."${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}

/** An actor with the given permission role; creates the login row so audit_log FKs hold. */
export async function createActor(role: Role, email = `${role}@test.local`): Promise<Actor> {
  const id = `user-${role}`;
  await db
    .insert(user)
    .values({ id, name: `Test ${role}`, email, emailVerified: true, role })
    .onConflictDoNothing();
  return {
    id,
    name: `Test ${role}`,
    email,
    role,
    locale: "de",
    staffMemberId: null,
    firstName: "Test",
    displayName: `Test ${role}`,
  };
}

/** Minimal catalogue for generating events: a type, a venue, duty roles, two staff and two presets. */
export async function seedCatalogue() {
  const [type] = await db
    .insert(eventType)
    .values({
      key: "flea",
      nameDe: "Flohmarkt",
      nameEn: "Flea market",
      rules: {
        newGoodsMaxShare: 0.2,
        bannedGoods: [],
        onlineBookingAllowed: true,
        defaultPricePerMCents: 1200,
        defaultBookingFeeCents: 500,
        vendorContractModel: "per_event",
      },
    })
    .returning();
  const [place] = await db
    .insert(venue)
    .values({ name: "Messeplatz Test", kind: "municipal", city: "Köln" })
    .returning();
  const [anna, ben] = await db
    .insert(staffMember)
    .values([
      { displayName: "Anna Test", firstName: "Anna", lastName: "Test" },
      { displayName: "Ben Test", firstName: "Ben", lastName: "Test" },
    ])
    .returning();
  const [lead, setup] = await db
    .insert(dutyRole)
    .values([
      { key: "market_lead", nameDe: "Marktleitung", nameEn: "Market lead" },
      { key: "setup", nameDe: "Aufbau", nameEn: "Setup" },
    ])
    .returning();
  if (!type || !place || !anna || !ben || !lead || !setup) throw new Error("seed failed");

  // Market Zeitplan: vendors set up 05:00–08:00, visitors 08:00–16:00, vendors tear down 16:00–18:00.
  const schedule = scheduleFromTimes({
    setup: "05:00",
    open: "08:00",
    close: "16:00",
    teardown: "18:00",
  });
  const [flea, festival] = await db
    .insert(eventPreset)
    .values([
      {
        key: "test-flea",
        eventTypeId: type.id,
        venueId: place.id,
        name: "Testflohmarkt",
        pricePerMCents: 1200,
        bookingFeeCents: 500,
        schedule,
        durationDays: 1,
        // "ghost" has no duty_role row and must be skipped, not fail.
        defaultDuties: { market_lead: anna.id, setup: ben.id, ghost: ben.id },
        rules: type.rules,
      },
      {
        key: "test-festival",
        eventTypeId: type.id,
        venueId: place.id,
        name: "Teststadtfest",
        pricePerMCents: 2000,
        bookingFeeCents: 0,
        schedule,
        durationDays: 3,
        rules: type.rules,
      },
    ])
    .returning();
  if (!flea || !festival) throw new Error("seed failed");

  return {
    type,
    venue: place,
    staff: { anna, ben },
    roles: { lead, setup },
    presets: { flea, festival },
    schedule,
  };
}
