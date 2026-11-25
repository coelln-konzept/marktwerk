/**
 * Build-time migration step (`apps/web/vercel.json` → `pnpm --filter @marktwerk/db migrate:build`).
 * Runs `drizzle-kit migrate` only when `decideBuildMigration` allows it; see migrate-gate.ts for the rules.
 * Runs with Node's built-in type stripping (`node scripts/migrate-on-build.ts`), no build step.
 */
import { spawnSync } from "node:child_process";
import { decideBuildMigration } from "./migrate-gate.ts";

const decision = decideBuildMigration(process.env);
console.log(decision.message);

if (decision.migrate) {
  // pnpm puts this package's node_modules/.bin on PATH, so drizzle-kit resolves like in the `migrate` script.
  const result = spawnSync("drizzle-kit", ["migrate"], { stdio: "inherit" });
  if (result.error) {
    console.error("[migrate] Could not start drizzle-kit:", result.error);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
