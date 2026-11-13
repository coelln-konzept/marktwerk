/**
 * `pnpm db:wipe -- --yes`: empties all app data except logins (see wipe-app-data.ts), then `pnpm db:seed` loads
 * the synthetic dataset again as of today. Destructive: refuses to run without `--yes`.
 */
import { createDb } from "@marktwerk/db";
import { wipeAppData } from "./wipe-app-data";

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const { hostname, pathname } = new URL(url);
const target = `${hostname}${pathname}`;

if (!process.argv.includes("--yes")) {
  console.error(`Refusing to wipe ${target} without --yes (pnpm db:wipe -- --yes).`);
  process.exit(1);
}

const db = createDb(url);
const count = await wipeAppData(db);
console.log(`✓ wiped ${count} tables on ${target}; logins kept`);
await db.$client.end();
