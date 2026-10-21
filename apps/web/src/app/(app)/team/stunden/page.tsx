import { can, monthEnd } from "@marktwerk/core";
import { Clock, Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { Banner } from "@/components/team/banner";
import { MonthGrid } from "@/components/team/month-grid";
import { PeriodBadge } from "@/components/team/month-status";
import { PersonMonthVorschau } from "@/components/team/person-month-vorschau";
import { MonthNav, monthParam, TeamTabs } from "@/components/team/team-nav";
import { buttonVariants } from "@/components/ui/button";
import { formatDateShort, formatHours, todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { getMonthFigures, listShiftRows } from "@/server/queries/hours";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("hours.month"))("title") };
}

const PATH = "/team/stunden";
const MAX_BANNERS = 3;

/** Team › Stunden: the month grid (people × days) with hours, pay and the Minijob allowance. */
export default async function HoursPage({ searchParams }: PageProps<"/team/stunden">) {
  await requirePermission("team", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const [t, tNav, tTeam, locale] = await Promise.all([
    getTranslations("hours.month"),
    getTranslations("nav"),
    getTranslations("team"),
    getLocale(),
  ]);
  const today = todayIn();
  const current = `${today.slice(0, 7)}-01`;
  const month = monthParam(param(sp.month), today);
  const figures = await getMonthFigures(month, today);
  const canManage = can(actor.role, "team", "manage");
  const personId = param(sp.person);
  const closeHref = hrefWith(PATH, sp, { person: undefined });
  const status = figures.period?.status ?? "open";

  const missing = figures.rows.reduce((sum, r) => sum + r.missingTimes, 0);
  const deadlines = figures.rows
    .flatMap((r) => (r.missingDeadline ? [r.missingDeadline] : []))
    .sort();
  const arbzg = figures.rows.flatMap((r) => r.arbzg.map((w) => ({ name: r.displayName, w })));
  const shifts =
    personId && figures.rows.some((r) => r.staffMemberId === personId)
      ? await listShiftRows(
          actor,
          { staffMemberId: personId, from: month, to: monthEnd(month) },
          today,
        )
      : [];

  const arbzgText = (name: string, w: (typeof arbzg)[number]["w"]) => {
    const date = formatDateShort(w.date, locale);
    switch (w.code) {
      case "daily_max":
        return t("banner.dailyMax", {
          name,
          hours: formatHours(w.minutes, locale),
          date,
          limit: formatHours(w.limit, locale),
        });
      case "rest_period":
        return t("banner.rest", {
          name,
          rest: formatHours(w.restMinutes, locale),
          date,
          limit: formatHours(w.limit, locale),
        });
      case "break_missing":
        return t("banner.break", { name, date, minutes: w.required });
      case "overlap":
        return t("banner.overlap", { name, date });
    }
  };

  return (
    <Page crumbs={[{ label: tNav("team"), href: "/team" }, { label: tTeam("tabs.hours") }]} wide>
      <PageHeader
        title={tTeam("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <PeriodBadge status={status} />
            {canManage && (
              <Link
                href={`/team/stunden/abschluss?month=${month.slice(0, 7)}` as never}
                className={buttonVariants({ variant: "default" })}
              >
                <Lock aria-hidden />
                {status === "open" ? t("close") : t("closeOpen")}
              </Link>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TeamTabs active="hours" month={month} />
        <MonthNav path={PATH} month={month} current={current} sp={sp} />
      </div>

      <div className="flex flex-col gap-2">
        {missing > 0 && (
          <Banner
            tone="critical"
            icon={Clock}
            action={{
              href: `/team/schichten?month=${month.slice(0, 7)}`,
              label: t("banner.enter"),
            }}
          >
            <b>{t("banner.missing", { count: missing })}</b>
            {deadlines[0] &&
              ` · ${t("banner.deadline", { date: formatDateShort(deadlines[0], locale) })}`}
          </Banner>
        )}
        {arbzg.slice(0, MAX_BANNERS).map(({ name, w }) => (
          <Banner
            key={`${name}-${w.code}-${w.date}`}
            tone="warn"
            icon={TriangleAlert}
            action={{
              href: `/team/schichten?month=${month.slice(0, 7)}&day=${w.date}`,
              label: t("banner.view"),
            }}
          >
            <b>{t("banner.workingTime")}</b> {arbzgText(name, w)}
          </Banner>
        ))}
        {arbzg.length > MAX_BANNERS && (
          <p className="m-0 text-muted-foreground text-small">
            {t("banner.more", { count: arbzg.length - MAX_BANNERS })}
          </p>
        )}
      </div>

      <MonthGrid figures={figures} path={PATH} sp={sp} />

      {personId && (
        <PersonMonthVorschau
          figures={figures}
          personId={personId}
          shifts={shifts}
          closeHref={closeHref}
          actor={actor}
        />
      )}
    </Page>
  );
}
