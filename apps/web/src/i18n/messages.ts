import type { Locale } from "./config";

/**
 * Messages are split into one file per area (messages/<locale>/<area>.json), so screens can be
 * worked on independently. Every area exists in both locales with identical keys
 * (checked by `pnpm --filter @marktwerk/web test`). Namespaces must not repeat across areas.
 */
export const MESSAGE_AREAS = [
  "shell",
  "events",
  "generate",
  "overview",
  "kalender",
  "event-detail",
  "venues",
  "contacts",
  "team",
  "vendors",
  "templates",
  "tasks-templates",
  "settings",
  "agreements",
] as const;

export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const parts = await Promise.all(
    MESSAGE_AREAS.map(
      (area) => import(`../../messages/${locale}/${area}.json`) as Promise<{ default: object }>,
    ),
  );
  return Object.assign({}, ...parts.map((p) => p.default));
}
