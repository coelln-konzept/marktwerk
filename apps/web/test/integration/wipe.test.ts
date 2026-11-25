import { randomUUID } from "node:crypto";
import { account, contact, user, userPreference } from "@marktwerk/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { KEPT_TABLES, tablesToWipe, wipeAppData } from "../../scripts/wipe-app-data";
import { createActor, resetDatabase } from "../helpers/fixtures";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$client.end();
});

describe("wipe app data (reseed with a new dataset, Fahrplan R20)", () => {
  it("keeps exactly the sign-in tables", () => {
    expect(tablesToWipe(["task", "user", "event", "session", "account", "verification"])).toEqual([
      "event",
      "task",
    ]);
    expect(KEPT_TABLES).toContain("user_preference");
  });

  it("empties app data but keeps users, their accounts and preferences", async () => {
    const owner = await createActor("owner");
    await db.insert(account).values({
      id: "acc-owner",
      accountId: owner.id,
      providerId: "credential",
      userId: owner.id,
      password: "hash",
    });
    await db.insert(userPreference).values({ userId: owner.id });
    await db
      .insert(contact)
      .values({ id: randomUUID(), kind: "authority", name: "Ordnungsamt Testhausen" });

    const wiped = await wipeAppData(db);

    expect(wiped).toBeGreaterThan(30);
    expect(await db.select().from(contact)).toHaveLength(0);
    expect((await db.select().from(user)).map((u) => u.id)).toEqual([owner.id]);
    expect(await db.select().from(account)).toHaveLength(1);
    expect(await db.select().from(userPreference)).toHaveLength(1);
  });
});
