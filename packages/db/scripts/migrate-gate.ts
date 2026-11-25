/**
 * Decides whether a build may run the database migrations (Fahrplan AU5, docs/development/deployment.md).
 *
 * Vercel builds every pushed branch as a preview. Without their own branch database, previews use the shared
 * Preview `DATABASE_URL`, so migrating there would change a shared database before the PR is reviewed or merged.
 * Rules:
 * - no `VERCEL_ENV` (local, CI, any other host): migrate, as before;
 * - `VERCEL_ENV=production`: migrate;
 * - any other Vercel environment (`preview`, `development`): migrate only with `MIGRATE_ON_PREVIEW=1`, which is
 *   set only as a branch-scoped Preview variable of a branch environment with its own Neon database.
 */

export type MigrationEnv = {
  VERCEL_ENV?: string | undefined;
  MIGRATE_ON_PREVIEW?: string | undefined;
};

export type MigrationDecision = {
  migrate: boolean;
  message: string;
};

export const OPT_IN_VARIABLE = "MIGRATE_ON_PREVIEW";

export function decideBuildMigration(env: MigrationEnv): MigrationDecision {
  const vercelEnv = env.VERCEL_ENV?.trim() ?? "";
  if (vercelEnv === "") {
    return { migrate: true, message: "[migrate] Not a Vercel build: running migrations." };
  }
  if (vercelEnv === "production") {
    return { migrate: true, message: "[migrate] Vercel production build: running migrations." };
  }

  const optIn = env.MIGRATE_ON_PREVIEW?.trim() ?? "";
  if (optIn === "1") {
    return {
      migrate: true,
      message: `[migrate] Vercel ${vercelEnv} build with ${OPT_IN_VARIABLE}=1 (branch database): running migrations.`,
    };
  }

  const ignored = optIn === "" ? "" : ` (${OPT_IN_VARIABLE} is "${optIn}", only "1" opts in)`;
  return {
    migrate: false,
    message:
      `[migrate] Skipped: Vercel ${vercelEnv} build without ${OPT_IN_VARIABLE}=1${ignored}. ` +
      "Previews without their own branch database may share the dev database; " +
      "migrations reach it only from production builds (see docs/development/deployment.md).",
  };
}
