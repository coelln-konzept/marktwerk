import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at startup. Import `env` instead of
 * reading process.env directly so a missing variable fails loudly.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  APP_URL: z.url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("Europe/Berlin"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  /** Optional on Vercel: falls back to the deployment URL (preview deployments). */
  BETTER_AUTH_URL: z.url().optional(),
  /** Bearer token the external scheduler sends to /api/cron/* (ADR 0017). */
  CRON_SECRET: z.string().min(32).optional(),
  VERCEL_URL: z.string().optional(),
  /** Where uploaded documents live: plain files under ./.data/files, or an S3-compatible bucket. */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  /** Directory of the local driver (default `.data/files` in the web app's working directory). */
  STORAGE_LOCAL_DIR: z.string().min(1).optional(),
});

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  BETTER_AUTH_URL:
    parsed.BETTER_AUTH_URL ??
    (parsed.VERCEL_URL ? `https://${parsed.VERCEL_URL}` : "http://localhost:3000"),
};
