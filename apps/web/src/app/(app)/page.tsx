import { can } from "@marktwerk/core";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EventVorschau } from "@/components/events/event-vorschau";
import { DueToday } from "@/components/overview/due-today";
import { KpiStrip } from "@/components/overview/kpi-strip";
import { PastMarketsDrawer, PastMarketsLine } from "@/components/overview/past-markets";
import { WeekendTable } from "@/components/overview/weekend-table";
import { Page, PageHeader } from "@/components/shell/page";
import { formatDate, formatWeek, todayIn } from "@/lib/format";
import { HIDDEN_MODULES } from "@/lib/modules";
import { param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { getOverview } from "@/server/queries/overview";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("overview") };
}

/** Hour of day in the company's time zone. */
function berlinHour(timeZone = "Europe/Berlin"): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date())
    .find((p) => p.type === "hour")?.value;
  return Number(hour ?? 12);
}

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("overview");
  const tNav = await getTranslations("nav");
  const locale = await getLocale();
  const today = todayIn();
  const hour = berlinHour();
  const part = hour < 11 ? "morning" : hour < 17 ? "day" : "evening";
  const weekday = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${today}T12:00:00Z`));
  const overview = await getOverview(actor, today, HIDDEN_MODULES);
  const vorschauId = param(sp.vorschau);
  const canWrite = can(actor.role, "task", "write");

  return (
    <Page crumbs={[{ label: tNav("overview") }]}>
      <PageHeader
        eyebrow={
          <span className="tabular">
            {weekday}, {formatDate(today, locale)} · {formatWeek(today, locale)}
          </span>
        }
        title={t(`greeting.${part}`, { name: actor.firstName })}
        actions={<KpiStrip kpis={overview.kpis} />}
      />
      <WeekendTable
        weekend={overview.weekend}
        next={overview.nextAfterWeekend}
        vorschauId={vorschauId}
      />
      <PastMarketsLine count={overview.pastMarketTasks} query={sp} canCleanup={canWrite} />
      <DueToday
        due={overview.due}
        showAll={param(sp.alle) === "1"}
        today={today}
        query={sp}
        canSnooze={canWrite}
      />
      {vorschauId && <EventVorschau id={vorschauId} closeHref="/" />}
      {canWrite && param(sp.aufraeumen) === "1" && (
        <PastMarketsDrawer actor={actor} today={today} query={sp} />
      )}
    </Page>
  );
}
