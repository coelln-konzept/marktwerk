import { CalendarX } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Health, HealthShape } from "@/components/ui/health";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateRange, formatDateShort, formatWeek } from "@/lib/format";
import type { Overview } from "@/server/queries/overview";

/** "Nächstes Wochenende": one row per event, Genehmigungen/Aufgaben/Geld/Aufwand join in M2–M5. */
export async function WeekendTable({
  weekend,
  next,
  vorschauId,
}: {
  weekend: Overview["weekend"];
  next: Overview["nextAfterWeekend"];
  vorschauId?: string;
}) {
  const t = await getTranslations("overview.weekend");
  const tHealth = await getTranslations("health");
  const locale = await getLocale();
  const range = t("range", {
    from: formatDateShort(weekend.saturday, locale),
    to: formatDateShort(weekend.sunday, locale),
    week: formatWeek(weekend.saturday, locale),
  });
  const open = (label: string) => (
    <Health level="none" label={<span className="sr-only">{label}</span>} />
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
                <TH>{t("cols.team")}</TH>
                <TH className="hidden md:table-cell">{t("cols.money")}</TH>
                <TH className="hidden text-right md:table-cell">{t("cols.effort")}</TH>
              </tr>
            </THead>
            <tbody>
              {weekend.rows.map((r) => {
                const href = `/veranstaltungen/${r.id}`;
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
                    <TD className="hidden md:table-cell">{open(tHealth("none"))}</TD>
                    <TD className="hidden md:table-cell">{open(tHealth("none"))}</TD>
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
                        open(tHealth("none"))
                      )}
                    </TD>
                    <TD className="hidden md:table-cell">{open(tHealth("none"))}</TD>
                    <TD className="tabular hidden text-right text-muted-foreground md:table-cell">
                      –
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </KeyboardRows>
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
