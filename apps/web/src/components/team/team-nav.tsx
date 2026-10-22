import { addMonthsToMonth } from "@marktwerk/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatMonth } from "@/lib/format";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";

/** "2026-05" from the URL → "2026-05-01"; anything else = the current month. */
export function monthParam(value: string | undefined, today: string): string {
  const month = value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7);
  return `${month}-01`;
}

/** The tabs of the Team page: Personen · Stunden · Schichten (each its own URL). */
export async function TeamTabs({
  active,
  month,
}: {
  active: "people" | "hours" | "shifts";
  month?: string;
}) {
  const t = await getTranslations("team");
  const suffix = month ? `?month=${month.slice(0, 7)}` : "";
  const tabs = [
    { key: "people", href: "/team" },
    { key: "hours", href: `/team/stunden${suffix}` },
    { key: "shifts", href: `/team/schichten${suffix}` },
  ] as const;
  return (
    <nav aria-label={t("tabsLabel")}>
      <ul className="m-0 inline-flex list-none gap-0.5 rounded-lg border border-input bg-sunken p-0.5">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href as never}
              aria-current={active === tab.key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-7 items-center rounded-md px-3 font-medium",
                active === tab.key
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`tabs.${tab.key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Previous / next month with the month name between; keeps the other search params. */
export async function MonthNav({
  path,
  month,
  current,
  sp,
}: {
  path: string;
  month: string;
  /** The current month ("YYYY-MM-01"), for the "Heute" link. */
  current: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("hours.month")]);
  const link = (target: string) => hrefWith(path, sp, { month: target.slice(0, 7) });
  const button =
    "inline-flex size-8 items-center justify-center rounded-lg border border-input bg-card hover:bg-hover";
  return (
    <div className="flex items-center gap-2">
      <Link
        href={link(addMonthsToMonth(month, -1)) as never}
        className={button}
        aria-label={t("previous")}
      >
        <ChevronLeft aria-hidden className="size-4" />
      </Link>
      <span className="min-w-32 text-center font-semibold" aria-live="polite">
        {formatMonth(month, locale)}
      </span>
      <Link
        href={link(addMonthsToMonth(month, 1)) as never}
        className={button}
        aria-label={t("next")}
      >
        <ChevronRight aria-hidden className="size-4" />
      </Link>
      {month !== current && (
        <Link
          href={link(current) as never}
          className="inline-flex min-h-8 items-center rounded-lg px-2 text-accent-soft-foreground hover:underline"
        >
          {t("current")}
        </Link>
      )}
    </div>
  );
}
