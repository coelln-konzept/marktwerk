import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile("../../.env");
} catch {
  // no root .env (CI, Vercel): real environment variables are used
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    // Migrations need a session-mode connection; on Supabase that's the pooler on port 5432 (ADR 0017).
    url:
      process.env.DATABASE_MIGRATION_URL ??
      process.env.DATABASE_URL ??
      "postgres://marktwerk:marktwerk@localhost:5432/marktwerk",
  },
  strict: true,
  verbose: true,
});
