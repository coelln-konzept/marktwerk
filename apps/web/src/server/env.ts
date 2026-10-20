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
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);
