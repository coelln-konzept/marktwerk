import "server-only";
import { can, isRole, type Role } from "@marktwerk/core";
import { session, staffMember, user } from "@marktwerk/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

/**
 * User administration (Einstellungen → Benutzer & Rollen). Owner only (`user:manage`).
 * Logins are never deleted, only deactivated (banned) and reactivated.
 *
 * Why direct table updates instead of `auth.api.setRole / banUser / unbanUser`: those endpoints run
 * on Better Auth's own database handle and cannot join our transaction, so the change and its audit
 * entry could diverge (a role changed without an audit row, or the reverse). We therefore write the
 * same columns the admin plugin writes (`user.role`, `banned`, `ban_reason`, `ban_expires`) and, like
 * `banUser`, delete the user's sessions, all in one transaction with the audit entry. The plugin
 * stays configured for the sign-in checks (banned users cannot sign in) and `getCurrentUser()`
 * reads role and ban state from the database on every request, so changes take effect at once.
 * `audit_log.entity_id` is a uuid but Better Auth ids are free-form text, so the user id is
 * always also in the diff and used as entity id only when it is a uuid.
 */

export type UserError =
  | "not_found"
  | "invalid_role"
  | "last_owner"
  | "staff_not_found"
  | "staff_taken";

export class UserInputError extends Error {
  constructor(readonly code: UserError) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entityIdOf = (userId: string) => (UUID.test(userId) ? userId : null);

async function lockUser(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  if (!row) throw new UserInputError("not_found");
  return { id: row.id, role: row.role, banned: row.banned === true };
}

/**
 * The company must keep at least one active (not deactivated) owner. Locks all owner rows so two
 * concurrent demotions cannot both pass. Call before a change that removes `target` as an active owner.
 */
async function assertAnotherActiveOwner(tx: Tx, targetId: string) {
  const owners = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "owner"), or(isNull(user.banned), eq(user.banned, false))))
    .for("update");
  if (!owners.some((o) => o.id !== targetId)) throw new UserInputError("last_owner");
}

const isActiveOwner = (u: { role: string; banned: boolean }) => u.role === "owner" && !u.banned;

/** Changes the permission role. Audit "user.role" {userId, from, to}. No-op when unchanged. */
export async function changeUserRole(actor: Actor, userId: string, role: string) {
  if (!can(actor.role, "user", "manage")) forbidden();
  if (!isRole(role)) throw new UserInputError("invalid_role");
  const to: Role = role;

  return db.transaction(async (tx) => {
    const current = await lockUser(tx, userId);
    if (current.role === to) return { changed: false as const, from: current.role, to };
    if (isActiveOwner(current)) await assertAnotherActiveOwner(tx, userId);
    await tx.update(user).set({ role: to }).where(eq(user.id, userId));
    await audit(tx, actor.id, [
      {
        action: "user.role",
        entityType: "user",
        entityId: entityIdOf(userId),
        diff: { userId, from: current.role, to },
      },
    ]);
    return { changed: true as const, from: current.role, to };
  });
}

/**
 * Deactivates a login (Better Auth "ban"): it can no longer sign in and its sessions end now.
 * Audit "user.ban" {userId}. No-op when already deactivated.
 */
export async function banUser(actor: Actor, userId: string) {
  if (!can(actor.role, "user", "manage")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockUser(tx, userId);
    if (current.banned) return { changed: false as const };
    if (isActiveOwner(current)) await assertAnotherActiveOwner(tx, userId);
    await tx
      .update(user)
      .set({ banned: true, banReason: null, banExpires: null })
      .where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, actor.id, [
      {
        action: "user.ban",
        entityType: "user",
        entityId: entityIdOf(userId),
        diff: { userId },
      },
    ]);
    return { changed: true as const };
  });
}

/** Reactivates a deactivated login. Audit "user.unban" {userId}. No-op when not deactivated. */
export async function unbanUser(actor: Actor, userId: string) {
  if (!can(actor.role, "user", "manage")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockUser(tx, userId);
    if (!current.banned) return { changed: false as const };
    await tx
      .update(user)
      .set({ banned: false, banReason: null, banExpires: null })
      .where(eq(user.id, userId));
    await audit(tx, actor.id, [
      {
        action: "user.unban",
        entityType: "user",
        entityId: entityIdOf(userId),
        diff: { userId },
      },
    ]);
    return { changed: true as const };
  });
}

/**
 * Links a login to a staff member (ADR 0012: 1:1, optional) or removes the link (`staffMemberId` null).
 * A login that is already linked to someone else is re-linked in the same step; a staff member who
 * belongs to another login is refused ("staff_taken"). Archived staff members cannot be linked.
 * Audit "user.link_staff" {userId, from, to} with staff member ids.
 */
export async function linkStaffMember(actor: Actor, userId: string, staffMemberId: string | null) {
  if (!can(actor.role, "user", "manage")) forbidden();
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [linked] = await tx
      .select({ id: staffMember.id })
      .from(staffMember)
      .where(eq(staffMember.userId, userId))
      .for("update");
    const from = linked?.id ?? null;
    if (from === staffMemberId) return { changed: false as const, from, to: staffMemberId };

    if (staffMemberId !== null) {
      if (!UUID.test(staffMemberId)) throw new UserInputError("staff_not_found");
      const [target] = await tx
        .select({
          id: staffMember.id,
          userId: staffMember.userId,
          archivedAt: staffMember.archivedAt,
        })
        .from(staffMember)
        .where(eq(staffMember.id, staffMemberId))
        .for("update");
      if (!target || target.archivedAt) throw new UserInputError("staff_not_found");
      if (target.userId && target.userId !== userId) throw new UserInputError("staff_taken");
    }

    // Free the old link first: staff_member.user_id is unique.
    if (from) {
      await tx.update(staffMember).set({ userId: null }).where(eq(staffMember.id, from));
    }
    if (staffMemberId !== null) {
      await tx.update(staffMember).set({ userId }).where(eq(staffMember.id, staffMemberId));
    }
    await audit(tx, actor.id, [
      {
        action: "user.link_staff",
        entityType: "user",
        entityId: entityIdOf(userId),
        diff: { userId, from, to: staffMemberId },
      },
    ]);
    return { changed: true as const, from, to: staffMemberId };
  });
}
