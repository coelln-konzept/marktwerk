import { randomUUID } from "node:crypto";
import { account, auditLog, session, staffMember, user } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listLinkableStaff, listUsers } from "@/server/queries/settings";
import {
  banUser,
  changeUserRole,
  linkStaffMember,
  UserInputError,
  unbanUser,
} from "@/server/services/users";
import { createActor, resetDatabase } from "../helpers/fixtures";

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

/** A login with a uuid id (like the seed) or a free-form Better Auth id. */
async function makeUser(role: string, over: Partial<typeof user.$inferInsert> = {}) {
  const id = over.id ?? randomUUID();
  await db.insert(user).values({
    id,
    name: `Login ${id.slice(0, 4)}`,
    email: `${id}@test.local`,
    emailVerified: true,
    role,
    ...over,
  });
  return id;
}

async function makeStaff(name: string, over: Partial<typeof staffMember.$inferInsert> = {}) {
  const [row] = await db
    .insert(staffMember)
    .values({ displayName: name, firstName: name, lastName: "Test", ...over })
    .returning();
  if (!row) throw new Error("staff failed");
  return row;
}

const roleOf = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]?.role;
const audits = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action));
const codeOf = (error: unknown) => (error instanceof UserInputError ? error.code : error);

describe("changeUserRole", () => {
  it("sets the role and writes user.role with from/to", async () => {
    const id = await makeUser("staff");
    const result = await changeUserRole(owner, id, "field");
    expect(result).toEqual({ changed: true, from: "staff", to: "field" });
    expect(await roleOf(id)).toBe("field");
    const [entry] = await audits("user.role");
    expect(entry).toMatchObject({
      actorId: owner.id,
      entityType: "user",
      entityId: id,
      diff: { userId: id, from: "staff", to: "field" },
    });
  });

  it("keeps the user id in the diff when it is not a uuid (Better Auth ids)", async () => {
    const id = await makeUser("staff", { id: "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6" });
    await changeUserRole(owner, id, "manager");
    const [entry] = await audits("user.role");
    expect(entry?.entityId).toBeNull();
    expect(entry?.diff).toEqual({ userId: id, from: "staff", to: "manager" });
  });

  it("does nothing when the role is unchanged", async () => {
    const id = await makeUser("staff");
    expect((await changeUserRole(owner, id, "staff")).changed).toBe(false);
    expect(await audits("user.role")).toHaveLength(0);
  });

  it("rejects unknown roles and unknown logins without writing", async () => {
    const id = await makeUser("staff");
    expect(codeOf(await changeUserRole(owner, id, "admin").catch((e) => e))).toBe("invalid_role");
    expect(codeOf(await changeUserRole(owner, randomUUID(), "staff").catch((e) => e))).toBe(
      "not_found",
    );
    expect(await roleOf(id)).toBe("staff");
    expect(await audits("user.role")).toHaveLength(0);
  });

  it.each(["manager", "staff", "field"] as const)("is forbidden for %s", async (role) => {
    const actor = await createActor(role);
    const id = await makeUser("staff");
    expect(isForbidden(await changeUserRole(actor, id, "owner").catch((e) => e))).toBe(true);
    expect(await roleOf(id)).toBe("staff");
    expect(await audits("user.role")).toHaveLength(0);
  });

  describe("last owner guard", () => {
    it("the only owner cannot demote themself", async () => {
      expect(codeOf(await changeUserRole(owner, owner.id, "manager").catch((e) => e))).toBe(
        "last_owner",
      );
      expect(await roleOf(owner.id)).toBe("owner");
      expect(await audits("user.role")).toHaveLength(0);
    });

    it("an owner can step down while another active owner exists", async () => {
      await makeUser("owner");
      await expect(changeUserRole(owner, owner.id, "manager")).resolves.toMatchObject({
        changed: true,
      });
      expect(await roleOf(owner.id)).toBe("manager");
    });

    it("a deactivated owner does not count as another owner", async () => {
      await makeUser("owner", { banned: true });
      expect(codeOf(await changeUserRole(owner, owner.id, "staff").catch((e) => e))).toBe(
        "last_owner",
      );
    });

    it("demoting an already deactivated owner is fine", async () => {
      const other = await makeUser("owner", { banned: true });
      await expect(changeUserRole(owner, other, "staff")).resolves.toMatchObject({ changed: true });
    });

    it("promoting someone to owner is always allowed", async () => {
      const id = await makeUser("staff");
      await expect(changeUserRole(owner, id, "owner")).resolves.toMatchObject({ changed: true });
    });
  });
});

describe("banUser / unbanUser", () => {
  it("deactivates the login, ends its sessions and audits user.ban", async () => {
    const id = await makeUser("staff");
    await db.insert(session).values([
      { id: "s1", token: "t1", userId: id, expiresAt: new Date(Date.now() + 1e7) },
      { id: "s2", token: "t2", userId: id, expiresAt: new Date(Date.now() + 1e7) },
      { id: "s3", token: "t3", userId: owner.id, expiresAt: new Date(Date.now() + 1e7) },
    ]);
    expect(await banUser(owner, id)).toEqual({ changed: true });

    const [row] = await db.select().from(user).where(eq(user.id, id));
    expect(row).toMatchObject({ banned: true, banReason: null, banExpires: null });
    const left = await db.select().from(session);
    expect(left.map((s) => s.id)).toEqual(["s3"]);
    const [entry] = await audits("user.ban");
    expect(entry).toMatchObject({ actorId: owner.id, entityId: id, diff: { userId: id } });
  });

  it("never deletes the login or its credentials", async () => {
    const id = await makeUser("staff");
    await db
      .insert(account)
      .values({ id: "a1", accountId: id, providerId: "credential", userId: id });
    await banUser(owner, id);
    expect(await db.select().from(user).where(eq(user.id, id))).toHaveLength(1);
    expect(await db.select().from(account).where(eq(account.userId, id))).toHaveLength(1);
  });

  it("reactivates and audits user.unban", async () => {
    const id = await makeUser("staff", { banned: true, banReason: "x" });
    expect(await unbanUser(owner, id)).toEqual({ changed: true });
    const [row] = await db.select().from(user).where(eq(user.id, id));
    expect(row).toMatchObject({ banned: false, banReason: null });
    expect(await audits("user.unban")).toHaveLength(1);
  });

  it("is idempotent: no change, no audit entry", async () => {
    const id = await makeUser("staff");
    expect((await unbanUser(owner, id)).changed).toBe(false);
    await banUser(owner, id);
    expect((await banUser(owner, id)).changed).toBe(false);
    expect(await audits("user.ban")).toHaveLength(1);
    expect(await audits("user.unban")).toHaveLength(0);
  });

  it("the only owner cannot deactivate themself; with a second owner they can", async () => {
    expect(codeOf(await banUser(owner, owner.id).catch((e) => e))).toBe("last_owner");
    expect((await db.select().from(user).where(eq(user.id, owner.id)))[0]?.banned).toBeFalsy();

    await makeUser("owner");
    await expect(banUser(owner, owner.id)).resolves.toEqual({ changed: true });
  });

  it("two owners cannot deactivate each other in turn", async () => {
    const other = await makeUser("owner");
    await banUser(owner, other);
    expect(codeOf(await banUser(owner, owner.id).catch((e) => e))).toBe("last_owner");
  });

  it.each(["manager", "staff", "field"] as const)("is forbidden for %s", async (role) => {
    const actor = await createActor(role);
    const id = await makeUser("staff");
    expect(isForbidden(await banUser(actor, id).catch((e) => e))).toBe(true);
    expect(isForbidden(await unbanUser(actor, id).catch((e) => e))).toBe(true);
    expect(await audits("user.ban")).toHaveLength(0);
  });

  it("unknown login", async () => {
    expect(codeOf(await banUser(owner, randomUUID()).catch((e) => e))).toBe("not_found");
  });
});

describe("linkStaffMember", () => {
  it("links a login to a staff member and audits user.link_staff", async () => {
    const id = await makeUser("staff");
    const anna = await makeStaff("Anna");
    const result = await linkStaffMember(owner, id, anna.id);
    expect(result).toEqual({ changed: true, from: null, to: anna.id });
    expect(
      (await db.select().from(staffMember).where(eq(staffMember.id, anna.id)))[0]?.userId,
    ).toBe(id);
    const [entry] = await audits("user.link_staff");
    expect(entry).toMatchObject({
      actorId: owner.id,
      entityId: id,
      diff: { userId: id, from: null, to: anna.id },
    });
  });

  it("re-links in one step and frees the old staff member", async () => {
    const id = await makeUser("staff");
    const anna = await makeStaff("Anna", { userId: id });
    const ben = await makeStaff("Ben");
    await linkStaffMember(owner, id, ben.id);
    const rows = await db.select().from(staffMember);
    expect(Object.fromEntries(rows.map((r) => [r.displayName, r.userId]))).toEqual({
      Anna: null,
      Ben: id,
    });
    const [entry] = await audits("user.link_staff");
    expect(entry?.diff).toEqual({ userId: id, from: anna.id, to: ben.id });
  });

  it("removes the link with null", async () => {
    const id = await makeUser("staff");
    const anna = await makeStaff("Anna", { userId: id });
    expect(await linkStaffMember(owner, id, null)).toEqual({
      changed: true,
      from: anna.id,
      to: null,
    });
    expect((await db.select().from(staffMember))[0]?.userId).toBeNull();
  });

  it("does nothing when nothing changes", async () => {
    const id = await makeUser("staff");
    const anna = await makeStaff("Anna", { userId: id });
    expect((await linkStaffMember(owner, id, anna.id)).changed).toBe(false);
    expect((await linkStaffMember(owner, await makeUser("staff"), null)).changed).toBe(false);
    expect(await audits("user.link_staff")).toHaveLength(0);
  });

  it("refuses a staff member that belongs to another login", async () => {
    const mine = await makeUser("staff");
    const theirs = await makeUser("staff");
    const anna = await makeStaff("Anna", { userId: theirs });
    expect(codeOf(await linkStaffMember(owner, mine, anna.id).catch((e) => e))).toBe("staff_taken");
    expect((await db.select().from(staffMember))[0]?.userId).toBe(theirs);
    expect(await audits("user.link_staff")).toHaveLength(0);
  });

  it("refuses archived, unknown and malformed staff ids and unknown logins", async () => {
    const id = await makeUser("staff");
    const old = await makeStaff("Alt", { archivedAt: new Date() });
    for (const bad of [old.id, randomUUID(), "nope"]) {
      expect(codeOf(await linkStaffMember(owner, id, bad).catch((e) => e))).toBe("staff_not_found");
    }
    expect(codeOf(await linkStaffMember(owner, randomUUID(), null).catch((e) => e))).toBe(
      "not_found",
    );
  });

  it.each(["manager", "staff", "field"] as const)("is forbidden for %s", async (role) => {
    const actor = await createActor(role);
    const id = await makeUser("staff");
    const anna = await makeStaff("Anna");
    expect(isForbidden(await linkStaffMember(actor, id, anna.id).catch((e) => e))).toBe(true);
    expect((await db.select().from(staffMember))[0]?.userId).toBeNull();
  });
});

describe("listUsers / listLinkableStaff", () => {
  it("lists logins with linked staff member, last sign-in and ban state; active first", async () => {
    const active = await makeUser("manager", { name: "Zora" });
    const banned = await makeUser("staff", { name: "Abel", banned: true });
    const anna = await makeStaff("Anna", { userId: active });
    const first = new Date("2026-10-01T08:00:00Z");
    const latest = new Date("2026-10-20T08:00:00Z");
    await db.insert(session).values([
      { id: "s1", token: "t1", userId: active, expiresAt: latest, createdAt: first },
      { id: "s2", token: "t2", userId: active, expiresAt: latest, createdAt: latest },
    ]);

    const rows = await listUsers();
    const mine = rows.filter((r) => r.id === active || r.id === banned);
    expect(mine.map((r) => r.name)).toEqual(["Zora", "Abel"]);
    expect(mine[0]).toMatchObject({
      role: "manager",
      banned: false,
      staffMember: { id: anna.id, displayName: "Anna" },
    });
    expect(mine[0]?.lastSignIn?.toISOString()).toBe(latest.toISOString());
    expect(mine[1]).toMatchObject({ banned: true, lastSignIn: null, staffMember: null });
  });

  it("offers every non-archived staff member with the login they belong to", async () => {
    const id = await makeUser("staff");
    await makeStaff("Anna", { userId: id });
    await makeStaff("Ben");
    await makeStaff("Alt", { archivedAt: new Date() });
    const options = await listLinkableStaff();
    expect(options.map((o) => [o.displayName, o.userId])).toEqual([
      ["Anna", id],
      ["Ben", null],
    ]);
  });
});

describe("Better Auth honours our direct ban", () => {
  it("a deactivated login cannot sign in, a reactivated one can", async () => {
    const { auth } = await import("@/server/auth");
    const { hashPassword } = await import("better-auth/crypto");
    const id = await makeUser("staff", { email: "ban-check@test.local" });
    await db.insert(account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword("a-long-test-password"),
    });
    const body = { email: "ban-check@test.local", password: "a-long-test-password" };
    // Outside a Next.js request the cookie plugin cannot set cookies, so ask for a Response.
    const signIn = () => auth.api.signInEmail({ body, asResponse: true });

    await banUser(owner, id);
    const refused = await signIn();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "BANNED_USER" });

    await unbanUser(owner, id);
    expect((await signIn()).status).toBe(200);
  });
});
