import { defineConfig } from "drizzle-kit";

process.loadEnvFile?.("../../.env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://marktwerk:marktwerk@localhost:5432/marktwerk",
  },
  strict: true,
  verbose: true,
});
