/**
 * Development seed: company settings, the owner account and the M1 entities from the synthetic
 * dataset (ADR 0016): legal parameters, event types, contacts, venues with zones and rows, staff
 * members (+ logins for those with a permission role, and one field login for the logistics lead), duty roles, presets, events with anchors and
 * duties, vendors (read-only import), and the Phase 1 modules from ./seed/*: templates, checklists and
 * tasks (M2), permits (M3), contracts and shifts (M4), payables and instalments (M5), vehicles and
 * obligations (M6).
 *
 * Idempotent: synthetic rows keep their ids and are inserted with ON CONFLICT DO NOTHING, so the
 * script is safe to run repeatedly. Usage: `pnpm db:seed` from the repo root.
 */

import { randomUUID } from "node:crypto";
import { nextMarketColor } from "@marktwerk/core";
import { createDb, schema } from "@marktwerk/db";
import { deadlineSweep } from "@marktwerk/jobs";
import { generateDataset } from "@marktwerk/synthetic";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { seedCompany } from "./seed/company";
import { seedMoney } from "./seed/money";
import { seedPermits } from "./seed/permits";
import { ANCHOR_KEYS, insertAll, type SeedContext, type Tx } from "./seed/shared";
import { seedStaff } from "./seed/staff";
import { seedTasks } from "./seed/tasks";
import { seedTemplates } from "./seed/templates";

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
      // Client decision: no email for now. Turn on under Einstellungen → Firma.
      emailEnabled: false,
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

  // One field login (HANDOFF §7.5) to check the row-level scoping end to end: the logistics lead is the
  // default holder of "setup_crew" and so has duties at the events generated from the presets. Same rules
  // as the other logins: the public dev password only for a local database, otherwise SEED_STAFF_PASSWORD
  // (without it no login is created).
  const fieldStaffId = data.dutyRoles.find((r) => r.key === "setup_crew")?.defaultStaffMemberId;
  if (fieldStaffId) {
    const member = data.staffMembers.find((m) => m.id === fieldStaffId);
    const userId = await ensureUser(
      tx,
      process.env.SEED_FIELD_EMAIL || "logistik@marktwerk.local",
      member?.displayName ?? "Platzteam",
      "field",
      staffPassword,
    );
    if (userId) {
      await tx
        .update(schema.staffMember)
        .set({ userId })
        .where(eq(schema.staffMember.id, fieldStaffId));
    }
  }

  // Marktfarbe: assigned in creation order, each preset gets the least used colour so far.
  const presetColors: string[] = [];
  const presetRows = data.eventPresets.map(({ checklistTemplateId: _template, ...p }) => {
    const color = nextMarketColor(presetColors);
    presetColors.push(color);
    return { ...p, color };
  });
  await insertAll(tx, schema.eventPreset, presetRows, "presets");
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

  // Phase 1 modules (M2-M6). Each area has its own file under ./seed/ and runs in dependency order.
  const officeStaff =
    data.staffMembers.find((m) => m.permissionRole === "manager") ??
    data.staffMembers.find((m) => m.permissionRole === "owner");
  const ctx: SeedContext = { data, roleIdByKey, officeStaffId: officeStaff?.id ?? null };
  await seedTemplates(tx, ctx); // M2: checklist_template, template_version, template_item, preset links
  await seedTasks(tx, ctx); // M2: checklists + tasks
  await seedPermits(tx, ctx); // M3: permit_requirement, permit, event_permit
  await seedCompany(tx, ctx); // M6: vehicles, obligations (before payables, which reference vehicles)
  await seedMoney(tx, ctx); // M5: payables, instalments, event money
  await seedStaff(tx, ctx); // M4: contracts, shifts, payroll periods
});

// One deadline sweep, so the notification center (company-wide notifications) has content right away.
const sweep = await deadlineSweep(db);
console.log(`✓ deadline sweep: ${sweep.company.created} company-wide notifications`);

await db.$client.end();
