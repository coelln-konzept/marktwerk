/**
 * Development seed: company settings, the owner account and the M1 entities from the synthetic
 * dataset (ADR 0016): legal parameters, event types, contacts, venues with zones and rows, staff
 * members (+ logins for those with a permission role), duty roles, presets, events with anchors and
 * duties, vendors (read-only import).
 *
 * Idempotent: synthetic rows keep their ids and are inserted with ON CONFLICT DO NOTHING, so the
 * script is safe to run repeatedly. Usage: `pnpm db:seed` from the repo root.
 */

import { randomUUID } from "node:crypto";
import { createDb, schema } from "@marktwerk/db";
import { generateDataset } from "@marktwerk/synthetic";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@marktwerk.local";
const ownerName = process.env.SEED_OWNER_NAME || "Owner";

// The default password is public (it's in this repo), so it's only allowed for a local database.
// Anywhere else (Supabase dev, reachable from the internet) logins need passwords from secrets;
// without them, no new login is created (existing users are only linked to their staff record).
const DEV_PASSWORD = "marktwerk-dev-123";
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
const ownerPassword = process.env.SEED_OWNER_PASSWORD || (isLocal ? DEV_PASSWORD : null);
const staffPassword = process.env.SEED_STAFF_PASSWORD || (isLocal ? DEV_PASSWORD : null);

const db = createDb(url, { max: 1 });
const data = generateDataset();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Inserts in chunks (Postgres caps bind parameters at 65,535 per statement). */
async function insertAll<T extends object>(
  tx: Tx,
  table: Parameters<Tx["insert"]>[0],
  rows: T[],
  label: string,
) {
  for (let i = 0; i < rows.length; i += 500) {
    await tx
      .insert(table)
      .values(rows.slice(i, i + 500) as never)
      .onConflictDoNothing();
  }
  console.log(`✓ ${label}: ${rows.length}`);
}

/** Creates a credential login unless the email exists; returns the user id (null if none and no password). */
async function ensureUser(
  tx: Tx,
  email: string,
  name: string,
  role: string,
  password: string | null,
): Promise<string | null> {
  const existing = await tx.query.user.findFirst({ where: eq(schema.user.email, email) });
  if (existing) return existing.id;
  if (!password) {
    console.log(`– skipped login ${email} (${role}): no password secret for a non-local database`);
    return null;
  }
  const userId = randomUUID();
  await tx.insert(schema.user).values({ id: userId, name, email, emailVerified: true, role });
  await tx.insert(schema.account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
  console.log(`✓ login ${email} (${role})${isLocal ? ` / ${password}` : ""}`);
  return userId;
}

const ANCHOR_KEYS = {
  eventDay: "event_day",
  setupDay: "setup_day",
  bookingCutoff: "booking_cutoff",
} as const;

await db.transaction(async (tx) => {
  const s = data.settings;
  await tx
    .insert(schema.settings)
    .values({
      id: 1,
      companyName: s.companyName,
      addressLine1: s.street,
      postalCode: s.postalCode,
      city: s.city,
      email: s.email,
      phone: s.phoneE164,
      vatId: s.taxId,
      iban: s.iban,
      bic: s.bic,
      timeZone: s.timeZone,
      bundesland: s.bundesland,
      defaultDueTime: s.defaultDueTime,
    })
    .onConflictDoNothing();

  await insertAll(tx, schema.legalParameter, data.legalParameters, "legal parameters");
  await insertAll(
    tx,
    schema.eventType,
    data.eventTypes.map((t, sort) => ({ ...t, sort })),
    "event types",
  );
  await insertAll(tx, schema.contact, data.contacts, "contacts");
  await insertAll(
    tx,
    schema.venue,
    data.venues.map(({ zones: _zones, ...v }) => v),
    "venues",
  );
  const zones = data.venues.flatMap((v) => v.zones);
  await insertAll(
    tx,
    schema.zone,
    zones.map(({ rows: _rows, ...z }, sort) => ({ ...z, sort })),
    "zones",
  );
  await insertAll(
    tx,
    schema.venueRow,
    zones.flatMap((z) => z.rows.map((r, sort) => ({ ...r, sort }))),
    "rows",
  );

  // Staff first (without logins), then duty roles that point at default people.
  await insertAll(
    tx,
    schema.staffMember,
    data.staffMembers.map(({ permissionRole: _role, ...m }) => m),
    "staff members",
  );
  await insertAll(
    tx,
    schema.dutyRole,
    data.dutyRoles.map(({ id, key, nameDe, nameEn, defaultStaffMemberId, sort }) => ({
      id,
      key,
      nameDe,
      nameEn,
      defaultStaffMemberId,
      sort,
    })),
    "duty roles",
  );

  // Logins: the configured owner account is linked to the synthetic owner; other people with a
  // permission role get their own login (local: the development password; elsewhere: SEED_STAFF_PASSWORD).
  for (const m of data.staffMembers) {
    if (!m.permissionRole) continue;
    const email = m.permissionRole === "owner" ? ownerEmail : m.email;
    if (!email) continue;
    const name = m.permissionRole === "owner" ? ownerName : m.displayName;
    const password = m.permissionRole === "owner" ? ownerPassword : staffPassword;
    const userId = await ensureUser(tx, email, name, m.permissionRole, password);
    if (!userId) continue;
    await tx.update(schema.staffMember).set({ userId }).where(eq(schema.staffMember.id, m.id));
  }

  await insertAll(
    tx,
    schema.eventPreset,
    data.eventPresets.map(({ checklistTemplateId: _template, ...p }) => p),
    "presets",
  );
  await insertAll(
    tx,
    schema.event,
    data.events.map(({ duties: _duties, ...e }) => e),
    "events",
  );
  await insertAll(
    tx,
    schema.eventAnchor,
    data.eventAnchors.map((a) => ({ ...a, key: ANCHOR_KEYS[a.key] })),
    "event anchors",
  );
  const roleIdByKey = new Map(data.dutyRoles.map((r) => [r.key, r.id]));
  await insertAll(
    tx,
    schema.eventDuty,
    data.events.flatMap((e) =>
      Object.entries(e.duties).map(([key, staffMemberId]) => ({
        eventId: e.id,
        dutyRoleId: roleIdByKey.get(key as never) as string,
        staffMemberId,
      })),
    ),
    "event duties",
  );

  const importedAt = new Date();
  await insertAll(
    tx,
    schema.vendor,
    data.vendors.map((v) => ({ ...v, importedAt })),
    "vendors",
  );
});

await db.$client.end();
