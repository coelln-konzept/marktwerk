import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";
import { loadMessages } from "./messages";

/**
 * Locale comes from a cookie (set from the user's profile on login and by the
 * language switcher), not from the URL: the back office is behind login and
 * doesn't need localized URLs. The public vendor portal (Phase 2) may add
 * URL prefixes.
 */
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    timeZone: "Europe/Berlin",
    messages: await loadMessages(locale),
  };
});
