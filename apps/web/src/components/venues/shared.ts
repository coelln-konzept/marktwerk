"use client";

import { useTranslations } from "next-intl";

/** Same look as ui/input, for a native <select>. */
export const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 aria-invalid:border-destructive";

/** Text for an error code from the venue services (or a client-side check). */
export function useErrorText() {
  const t = useTranslations("venues.manage.errors");
  return (code: string) => (t.has(code as never) ? t(code as never) : t("generic"));
}

/** The form field an error code belongs to, so it can be marked and focused. */
export function fieldOfVenueError(code: string): string | null {
  switch (code) {
    case "invalid_name":
      return "venue-name";
    case "invalid_kind":
      return "venue-kind";
    case "invalid_street":
      return "venue-street";
    case "invalid_postal_code":
      return "venue-postal";
    case "invalid_city":
      return "venue-city";
    case "invalid_bundesland":
      return "venue-bundesland";
    case "invalid_access_info":
      return "venue-access";
    case "invalid_capacity":
      return "venue-capacity";
    case "invalid_coordinates":
      return "venue-lat";
    case "invalid_landowner":
      return "venue-landowner";
    default:
      return null;
  }
}
