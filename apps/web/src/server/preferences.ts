import "server-only";
import { cookies } from "next/headers";

export const THEMES = ["system", "light", "dark"] as const;
export const DENSITIES = ["standard", "compact"] as const;
export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export const THEME_COOKIE = "mw_theme";
export const DENSITY_COOKIE = "mw_density";

export const isTheme = (v: unknown): v is Theme => (THEMES as readonly unknown[]).includes(v);
export const isDensity = (v: unknown): v is Density =>
  (DENSITIES as readonly unknown[]).includes(v);

/**
 * Theme and density are stored in `user_preference` and mirrored to cookies (like the locale),
 * so the root layout can render the right `data-theme`/`data-density` without a database hit
 * and without a flash before hydration.
 */
export async function getDisplayPreferences(): Promise<{ theme: Theme; density: Density }> {
  const jar = await cookies();
  const theme = jar.get(THEME_COOKIE)?.value;
  const density = jar.get(DENSITY_COOKIE)?.value;
  return {
    theme: isTheme(theme) ? theme : "light",
    density: isDensity(density) ? density : "standard",
  };
}
