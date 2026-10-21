/** "21.10.2026, 14:32 Uhr" in the company time zone (Europe/Berlin); "21/10/2026, 14:32" in English. */
export function formatInstant(at: Date, locale: string, timeZone = "Europe/Berlin"): string {
  const parts = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date =
    locale === "en"
      ? `${get("day")}/${get("month")}/${get("year")}`
      : `${get("day")}.${get("month")}.${get("year")}`;
  const time = `${get("hour")}:${get("minute")}`;
  return locale === "en" ? `${date}, ${time}` : `${date}, ${time} Uhr`;
}
