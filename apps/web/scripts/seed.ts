/**
 * Development seed: company settings + the first owner account.
 * Idempotent; safe to run repeatedly. Usage: `pnpm db:seed` from the repo root.
 *
 * Domain sample data (venues, templates, markets) is added with the Phase 1
 * schema in milestone M1.
 */

import { randomUUID } from "node:crypto";
import { createDb, schema } from "@marktwerk/db";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const email = process.env.SEED_OWNER_EMAIL ?? "owner@marktwerk.local";
const password = process.env.SEED_OWNER_PASSWORD ?? "marktwerk-dev-123";
const name = process.env.SEED_OWNER_NAME ?? "Owner";

const db = createDb(url, { max: 1 });

await db
  .insert(schema.settings)
  .values({ id: 1, companyName: "Demo Flohmarkt GmbH", city: "Köln" })
  .onConflictDoNothing();

const existing = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
if (existing) {
  console.log(`✓ owner ${email} already exists`);
} else {
  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.user)
      .values({ id: userId, name, email, emailVerified: true, role: "owner" });
    await tx.insert(schema.account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(password),
    });
  });
  console.log(`✓ created owner ${email} / ${password}`);
}

await db.$client.end();
