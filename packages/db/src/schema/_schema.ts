import { pgSchema } from "drizzle-orm/pg-core";

/**
 * All marktwerk tables live in the `app` schema (not `public`): portable across
 * hosts and, on Supabase, outside the automatically exposed Data API (ADR 0017).
 */
export const app = pgSchema("app");
