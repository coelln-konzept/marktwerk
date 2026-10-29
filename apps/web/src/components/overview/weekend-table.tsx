import { type HealthReason, permitsReason, tasksReason } from "@marktwerk/core";
import { CalendarX } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Health, type HealthLevel, HealthShape } from "@/components/ui/health";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import {
  formatDateRangeYear,
  formatDateShort,
  formatDateShortYear,
  formatWeek,
  todayIn,
} from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import type { Overview } from "@/server/queries/overview";

const BLOCKER_ROWS = 8;

/**
 * "Dieses Wochenende", the first block of the Übersicht: one row per market with its readiness (permits,
 * tasks; team and money while those modules are visible), plus what holds the weekend up. Market names
 * open the Überblick of the market.
 */
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
  const today = todayIn();
  const range = t("range", {
    from: formatDateShort(weekend.saturday, locale),
    to: formatDateShort(weekend.sunday, locale),
    week: formatWeek(weekend.saturday, locale),
  });
  const reasonText = (reason: HealthReason | null) =>
    reason ? tHealth(`reason.${reason.key}`, { count: reason.count ?? 0 }) : null;
  /** Permits and tasks say why ("1 Genehmigung fehlt", "5 überfällig", "Im Plan"), the others the level. */
  const cell = (level: HealthLevel | null, reason: HealthReason | null = null) => (
    <Health
      level={level ?? "none"}
      label={
        level ? (
          (reasonText(reason) ?? tHealth(level))
        ) : (
          <span className="sr-only">{tHealth("none")}</span>
        )
      }
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
                  date: formatDateRangeYear(next.startsOn, next.endsOn, locale, today),
                })
              : t("emptyNone")
          }
        >
          {next && (
            <Link
              href={`/veranstaltungen/${next.id}` as never}
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
              </tr>
            </THead>
            <tbody>
              {weekend.rows.map((r) => {
                const href = `/veranstaltungen/${r.id}`;
                const peek = `/?vorschau=${r.id}`;
                const team = r.health.team;
                const permitReason = permitsReason(r.health.permits, r.reasons.permitsMissing);
                const taskReason = tasksReason(
                  r.health.tasks,
                  r.reasons.tasksOverdue,
                  r.reasons.tasksBlocked,
                );
                return (
                  <TR
                    key={r.id}
                    tabIndex={0}
                    data-row
                    data-href={href}
                    data-peek={peek}
                    aria-selected={vorschauId === r.id}
                    className="cursor-pointer outline-hidden focus-visible:bg-selected"
                  >
                    <TD className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <MarketMarker color={r.color} typeKey={r.typeKey} />
                        <Link
                          href={href as never}
                          tabIndex={-1}
                          className="font-semibold hover:underline"
                        >
                          {r.name}
                        </Link>
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <EventTypeTag typeKey={r.typeKey}>
                          {locale === "en" ? r.typeNameEn : r.typeNameDe}
                        </EventTypeTag>
                        <span className="tabular text-muted-foreground text-small">
                          {formatDateRangeYear(r.startsOn, r.endsOn, locale, today)}
                        </span>
                      </div>
                      {/* Phone: the readiness columns are hidden, so it sits under the name. */}
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 md:hidden">
                        <Health
                          level={r.health.permits ?? "none"}
                          label={`${t("cols.permits")}: ${reasonText(permitReason) ?? tHealth("none")}`}
                        />
                        <Health
                          level={r.health.tasks ?? "none"}
                          label={`${t("cols.tasks")}: ${reasonText(taskReason) ?? tHealth("none")}`}
                        />
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell">{cell(r.health.permits, permitReason)}</TD>
                    <TD className="hidden md:table-cell">{cell(r.health.tasks, taskReason)}</TD>
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
          <KeyboardRows>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {weekend.blockers.slice(0, BLOCKER_ROWS).map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  data-href={item.href}
                  className="-mx-2 flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-0.5 hover:bg-hover"
                >
                  <HealthShape
                    level={
                      item.urgency === "overdue"
                        ? "critical"
                        : item.urgency === "waiting"
                          ? "none"
                          : "warn"
                    }
                    className="translate-y-0.5"
                  />
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <Link href={item.href as never} className="font-medium hover:underline">
                      {item.title}
                    </Link>
                    {item.meta &&
                      (item.metaHref ? (
                        <Link
                          href={item.metaHref as never}
                          className="text-muted-foreground text-small hover:underline"
                        >
                          {item.meta}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-small">{item.meta}</span>
                      ))}
                    {item.kind === "permit" && weekend.rows.length > 1 && (
                      <span className="text-muted-foreground text-small">
                        {t("blockerFor", { events: item.eventNames.join(", ") })}
                      </span>
                    )}
                    <span className="tabular text-muted-foreground text-small">
                      {formatDateShortYear(item.dueOn, locale, today)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </KeyboardRows>
          {weekend.blockers.length > BLOCKER_ROWS && (
            <p className="m-0 mt-1.5 text-muted-foreground text-small">
              {t("blockersMore", { count: weekend.blockers.length - BLOCKER_ROWS })}
            </p>
          )}
        </section>
      )}
      {weekend.rows.length > 0 && (
        <PanelFooter className="hidden text-muted-foreground text-tiny md:flex">
          {t("keys")}
        </PanelFooter>
      )}
    </Panel>
  );
}
