import { CalendarX } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Health, type HealthLevel, HealthShape } from "@/components/ui/health";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateRange, formatDateShort, formatHours, formatWeek } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import type { Overview } from "@/server/queries/overview";

const BLOCKER_ROWS = 6;

/** "Nächstes Wochenende": one row per event with the four health dimensions and the open effort, plus what holds it up. */
export async function WeekendTable({
  weekend,
  next,
  vorschauId,
}: {
  weekend: Overview["weekend"];
  next: Overview["nextAfterWeekend"];
  vorschauId?: string;
}) {
  const showTeam = isModuleVisible("team");
  const showMoney = isModuleVisible("finance");
  const t = await getTranslations("overview.weekend");
  const tHealth = await getTranslations("health");
  const locale = await getLocale();
  const range = t("range", {
    from: formatDateShort(weekend.saturday, locale),
    to: formatDateShort(weekend.sunday, locale),
    week: formatWeek(weekend.saturday, locale),
  });
  const cell = (level: HealthLevel | null) => (
    <Health
      level={level ?? "none"}
      label={level ? tHealth(level) : <span className="sr-only">{tHealth("none")}</span>}
    />
  );
  return (
    <Panel aria-labelledby="weekend-title" className="overflow-hidden">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="weekend-title">{t("title")}</PanelTitle>
          <span className="tabular text-muted-foreground text-small">{range}</span>
        </div>
        <Link
          href="/veranstaltungen"
          className="inline-flex min-h-8 items-center rounded-lg px-2 font-medium hover:bg-hover"
        >
          {t("all")}
        </Link>
      </PanelHeader>
      {weekend.rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={t("empty")}
          hint={
            next
              ? t("emptyNext", {
                  name: next.name,
                  date: formatDateRange(next.startsOn, next.endsOn, locale),
                })
              : t("emptyNone")
          }
        >
          {next && (
            <Link
              href={`/veranstaltungen/${next.id}/board` as never}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("openEvent")}
            </Link>
          )}
        </EmptyState>
      ) : (
        <KeyboardRows>
          <Table>
            <caption className="sr-only">{t("caption")}</caption>
            <THead>
              <tr>
                <TH>{t("cols.event")}</TH>
                <TH className="hidden md:table-cell">{t("cols.permits")}</TH>
                <TH className="hidden md:table-cell">{t("cols.tasks")}</TH>
                {showTeam && <TH>{t("cols.team")}</TH>}
                {showMoney && <TH className="hidden md:table-cell">{t("cols.money")}</TH>}
                <TH className="hidden text-right md:table-cell">{t("cols.effort")}</TH>
              </tr>
            </THead>
            <tbody>
              {weekend.rows.map((r) => {
                const href = `/veranstaltungen/${r.id}/board`;
                const peek = `/?vorschau=${r.id}`;
                const team = r.health.team;
                return (
                  <TR
                    key={r.id}
                    tabIndex={0}
                    data-row
                    data-href={href}
                    data-peek={peek}
                    aria-selected={vorschauId === r.id}
                    className="cursor-pointer outline-none focus-visible:bg-selected"
                  >
                    <TD className="py-2">
                      <Link
                        href={peek as never}
                        scroll={false}
                        tabIndex={-1}
                        aria-label={t("preview", { name: r.name })}
                        className="font-semibold hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <EventTypeTag typeKey={r.typeKey}>
                          {locale === "en" ? r.typeNameEn : r.typeNameDe}
                        </EventTypeTag>
                        <span className="tabular text-muted-foreground text-small">
                          {formatDateRange(r.startsOn, r.endsOn, locale)}
                        </span>
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell">{cell(r.health.permits)}</TD>
                    <TD className="hidden md:table-cell">{cell(r.health.tasks)}</TD>
                    {showTeam && (
                      <TD>
                        {team ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Health
                              level={team}
                              label={
                                <>
                                  {r.duties}/{weekend.duties}
                                  <span className="sr-only"> ({tHealth(team)})</span>
                                </>
                              }
                            />
                          </span>
                        ) : (
                          cell(null)
                        )}
                      </TD>
                    )}
                    {showMoney && <TD className="hidden md:table-cell">{cell(r.health.money)}</TD>}
                    <TD className="tabular hidden text-right text-muted-foreground md:table-cell">
                      {weekend.effortMinutes[r.id]
                        ? formatHours(weekend.effortMinutes[r.id] as number, locale)
                        : t("effortNone")}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </KeyboardRows>
      )}
      {weekend.blockers.length > 0 && (
        <section
          aria-labelledby="weekend-blockers"
          className="border-border-subtle border-t px-4 py-3"
        >
          <h3 id="weekend-blockers" className="font-semibold text-small">
            {t("blockersTitle")}
          </h3>
          <p className="m-0 mb-2 text-muted-foreground text-tiny">{t("blockersHint")}</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {weekend.blockers.slice(0, BLOCKER_ROWS).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-baseline gap-x-2">
                <HealthShape level={item.urgency === "overdue" ? "critical" : "warn"} />
                <Link href={item.href as never} className="font-medium hover:underline">
                  {item.title}
                </Link>
                {item.meta && <span className="text-muted-foreground text-small">{item.meta}</span>}
                <span className="tabular text-muted-foreground text-small">
                  {formatDateShort(item.dueOn, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {weekend.rows.length > 0 && (
        <PanelFooter className="justify-between text-muted-foreground text-tiny">
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <LegendItem level="ok" label={tHealth("ok")} />
            <LegendItem level="warn" label={tHealth("warn")} />
            <LegendItem level="critical" label={tHealth("critical")} />
            <LegendItem level="none" label={tHealth("none")} />
          </span>
          <span>{t("legendNote")}</span>
        </PanelFooter>
      )}
    </Panel>
  );
}

function LegendItem({
  level,
  label,
}: {
  level: "ok" | "warn" | "critical" | "none";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <HealthShape level={level} />
      {label}
    </span>
  );
}
