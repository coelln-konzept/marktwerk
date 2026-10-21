import { boolean, jsonb, text } from "drizzle-orm/pg-core";
import { timestamps } from "./_columns";
import { app } from "./_schema";
import { user } from "./auth";

export const themePreference = app.enum("theme_preference", ["system", "light", "dark"]);
export const densityPreference = app.enum("density_preference", ["standard", "compact"]);

/** Per-user UI preferences (ADR 0019). Writes are preferences: no audit log. */
export const userPreference = app.table("user_preference", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  theme: themePreference().notNull().default("light"),
  density: densityPreference().notNull().default("standard"),
  sidebarCollapsed: boolean().notNull().default(false),
  /** Saved list filters and calendar layers, keyed by view (e.g. "kalender.layers"). */
  savedViews: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});
