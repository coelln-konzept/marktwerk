import { isIsoDate, monthEnd } from "@marktwerk/core";
import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { loadShiftScreen } from "@/components/team/shift-env";
import { type ShiftView, toShiftView } from "@/components/team/shift-types";
import { ShiftsPanel } from "@/components/team/shifts-panel";
import { MonthNav, monthParam, TeamTabs } from "@/components/team/team-nav";
import { formatDateRange, formatDateShort, todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("hours.shift"))("pageTitle") };
}

const PATH = "/team/schichten";

/** Team › Schichten: all shift records of a month, per event and for office hours (no event). */
export default async function ShiftsPage({ searchParams }: PageProps<"/team/schichten">) {
  await requirePermission("team", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const [t, tNav, tTeam, locale] = await Promise.all([
    getTranslations("hours.shift"),
    getTranslations("nav"),
    getTranslations("team"),
    getLocale(),
  ]);
  const today = todayIn();
  const current = `${today.slice(0, 7)}-01`;
  const month = monthParam(param(sp.month), today);
  const dayParam = param(sp.day);
  const day =
    dayParam && isIsoDate(dayParam) && dayParam.startsWith(month.slice(0, 7))
      ? dayParam
      : undefined;
  const personId = param(sp.person);
  const range = { from: day ?? month, to: day ?? monthEnd(month) };

  const { list, env } = await loadShiftScreen(
    actor,
    { ...range, staffMemberId: personId },
    today,
    locale,
    { months: [month], range: { from: month, to: monthEnd(month) } },
  );
  const views = list.rows.map((r) => toShiftView(r, locale));
  const groups = new Map<string | null, ShiftView[]>();
  for (const v of views) {
    const key = v.eventId;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  // Events in date order, office hours last (always there, so they can be added).
  const eventGroups = [...groups].filter(([key]) => key !== null);
  const office = groups.get(null) ?? [];
  const personName = personId
    ? views.find((v) => v.staffMemberId === personId)?.staffName
    : undefined;
  const defaultDate = day ?? (today.startsWith(month.slice(0, 7)) ? today : month);

  return (
    <Page crumbs={[{ label: tNav("team"), href: "/team" }, { label: tTeam("tabs.shifts") }]} wide>
      <PageHeader title={tTeam("title")} subtitle={t("subtitle")} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TeamTabs active="shifts" month={month} />
        <MonthNav path={PATH} month={month} current={current} sp={sp} />
      </div>

      {(personId || day) && (
        <div className="flex flex-wrap items-center gap-2 text-small">
          <span className="text-muted-foreground">{t("filters")}</span>
          {personId && (
            <Link
              href={hrefWith(PATH, sp, { person: undefined }) as never}
              className="inline-flex min-h-7 items-center gap-1 rounded-full border bg-card px-2.5 hover:bg-hover"
            >
              {personName ?? t("person")}
              <X aria-hidden className="size-3.5" />
              <span className="sr-only">{t("clearFilter")}</span>
            </Link>
          )}
          {day && (
            <Link
              href={hrefWith(PATH, sp, { day: undefined }) as never}
              className="inline-flex min-h-7 items-center gap-1 rounded-full border bg-card px-2.5 hover:bg-hover"
            >
              {formatDateShort(day, locale)}
              <X aria-hidden className="size-3.5" />
              <span className="sr-only">{t("clearFilter")}</span>
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {eventGroups.map(([eventId, shifts]) => {
          const first = shifts[0];
          const last = shifts.at(-1);
          return (
            <ShiftsPanel
              key={eventId}
              id={`shifts-${eventId}`}
              title={first?.eventName ?? ""}
              meta={
                first && last
                  ? t("meta", {
                      dates: formatDateRange(first.workDate, last.workDate, locale),
                      count: shifts.length,
                    })
                  : undefined
              }
              shifts={shifts}
              env={env}
              fixedEventId={eventId ?? undefined}
              defaultDate={first?.workDate ?? defaultDate}
              defaultPersonId={personId}
              showDates
              headerExtra={
                <Link
                  href={`/veranstaltungen/${eventId}/team` as never}
                  className="text-accent-soft-foreground text-small hover:underline"
                >
                  {t("openEvent")}
                </Link>
              }
            />
          );
        })}
        {(office.length > 0 || env.canManage || eventGroups.length === 0) && (
          <ShiftsPanel
            id="shifts-office"
            openOnNew
            title={t("office")}
            meta={t("officeHint")}
            shifts={office}
            env={env}
            defaultDate={defaultDate}
            defaultPersonId={personId}
            showDates
          />
        )}
      </div>
    </Page>
  );
}
