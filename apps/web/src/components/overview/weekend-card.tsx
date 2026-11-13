import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { DueBadge } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { rowFocus } from "@/components/ui/table";
import { formatDateRangeYear, formatDateShort, formatWeek } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { DueItem } from "@/server/queries/due";
import type { Overview, WeekendBlock, WeekendMarket } from "@/server/queries/overview";
import { itemHref, itemPeek } from "./links";
import { PeekLink } from "./peek-link";
import { TopTasksToggle } from "./top-tasks-toggle";
import { VerdictLine } from "./verdict-line";

/** Blockers behind the "Top-5-Aufgaben anzeigen" toggle of each market (CF9-2). */
export const TOP_BLOCKERS = 5;

const ROW = cn("flex cursor-pointer items-start gap-2 py-1.5 pr-4 pl-7 hover:bg-hover", rowFocus);

function Blocker({
  item,
  today,
  reserveStar,
}: {
  item: DueItem;
  today: string;
  reserveStar: boolean;
}) {
  const t = useTranslations("overview");
  const href = itemHref(item);
  const peek = itemPeek(item);
  return (
    <li
      data-row
      data-href={href}
      data-peek={peek}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
      tabIndex={0}
      className={ROW}
    >
      <span className="flex min-w-0 flex-1 items-start gap-1.5">
        {/* A fixed slot, so titles with and without the Kernaufgaben star start at the same x. */}
        {reserveStar && (
          <span className="mt-1 inline-flex w-4 shrink-0 justify-center">
            {item.isKey && <KeyTaskMark label={t("due.keyTask")} />}
          </span>
        )}
        <span className="min-w-0 break-words">
          {item.kind === "permit" && (
            <>
              <ShieldCheck
                aria-hidden
                className="mr-1 inline size-3.5 align-text-bottom text-foreground-2"
              />
              <span className="sr-only">{t("weekend.permit")}: </span>
            </>
          )}
          <Link
            href={href as never}
            scroll={item.kind !== "task"}
            className="font-medium hover:underline"
          >
            {item.title}
          </Link>
          {item.kind === "permit" && item.meta && (
            <span className="text-muted-foreground text-small"> · {item.meta}</span>
          )}
        </span>
      </span>
      <DueBadge dueOn={item.dueOn} today={today} className="shrink-0" />
    </li>
  );
}

async function MarketBlock({
  market,
  today,
  selected,
}: {
  market: WeekendMarket;
  today: string;
  selected: boolean;
}) {
  const t = await getTranslations("overview.weekend");
  const locale = await getLocale();
  const { row, verdict, blockers } = market;
  const href = `/veranstaltungen/${row.id}`;
  const reserveStar = isModuleVisible("keyTasks") && blockers.some((b) => b.isKey);
  return (
    <section
      aria-labelledby={`weekend-${row.id}`}
      className="border-border-subtle border-b last:border-b-0"
    >
      <div
        data-row
        data-href={href}
        data-peek={`/?vorschau=${row.id}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
        tabIndex={0}
        className={cn(
          "flex cursor-pointer flex-col gap-1 px-4 pt-3 pb-1.5 hover:bg-hover",
          rowFocus,
          selected && "bg-selected",
        )}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <MarketMarker color={row.color} typeKey={row.typeKey} />
          <h3 id={`weekend-${row.id}`} className="m-0 font-semibold text-body">
            <Link href={href as never} tabIndex={-1} className="hover:underline">
              {row.name}
            </Link>
          </h3>
          <span className="tabular text-muted-foreground text-small">
            {formatDateRangeYear(row.startsOn, row.endsOn, locale, today)}
          </span>
          <PeekLink eventId={row.id} name={row.name} className="-my-1 ml-auto" />
        </span>
        <VerdictLine verdict={verdict} />
      </div>
      {blockers.length > 0 && (
        <TopTasksToggle label={t("topTasks", { count: Math.min(blockers.length, TOP_BLOCKERS) })}>
          <ul
            aria-label={t("blockers", { name: row.name })}
            className="m-0 flex list-none flex-col p-0"
          >
            {blockers.slice(0, TOP_BLOCKERS).map((item) => (
              <Blocker
                key={`${item.kind}-${item.id}`}
                item={item}
                today={today}
                reserveStar={reserveStar}
              />
            ))}
          </ul>
          {blockers.length > TOP_BLOCKERS && (
            <Link
              href={href as never}
              className="ml-7 inline-flex min-h-8 items-center font-medium text-small hover:underline"
            >
              {t("allInSummary", { count: blockers.length })}
            </Link>
          )}
        </TopTasksToggle>
      )}
    </section>
  );
}

/**
 * "Dieses Wochenende", the first of the two questions on the Übersicht ("is the weekend on track?"): per
 * market one verdict line (Im Plan · Achtung · Nicht startklar, with the reasons) and, collapsed behind
 * "Top-5-Aufgaben anzeigen", its first {@link TOP_BLOCKERS} blockers (more link to the market's
 * Zusammenfassung); then one compact row for the weekend after. A market's name opens its Überblick.
 * Sits in the right column, Heute & überfällig in the left (CF9-2).
 */
export async function WeekendCard({
  weekend,
  next,
  nextEvent,
  today,
  vorschauId,
}: {
  weekend: WeekendBlock;
  next: WeekendBlock;
  nextEvent: Overview["nextEvent"];
  today: string;
  vorschauId?: string;
}) {
  const t = await getTranslations("overview.weekend");
  const locale = await getLocale();
  const range = (block: WeekendBlock) =>
    t("range", {
      from: formatDateShort(block.saturday, locale),
      to: formatDateShort(block.sunday, locale),
      week: formatWeek(block.saturday, locale),
    });
  return (
    <Panel aria-labelledby="weekend-title" className="flex min-w-0 flex-col">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="weekend-title">{t("title")}</PanelTitle>
          <span className="tabular text-muted-foreground text-small">{range(weekend)}</span>
        </div>
        <Link
          href="/veranstaltungen"
          className="inline-flex min-h-8 items-center rounded-lg px-2 font-medium hover:bg-hover"
        >
          {t("all")}
        </Link>
      </PanelHeader>
      {weekend.markets.length === 0 ? (
        <div className="px-4 py-4">
          <p className="m-0 font-medium">{t("empty")}</p>
          {next.markets.length === 0 && (
            <p className="m-0 mt-1 text-muted-foreground text-small">
              {nextEvent
                ? t("emptyNext", {
                    name: nextEvent.name,
                    date: formatDateRangeYear(nextEvent.startsOn, nextEvent.endsOn, locale, today),
                  })
                : t("emptyNone")}{" "}
              {nextEvent && (
                <Link
                  href={`/veranstaltungen/${nextEvent.id}` as never}
                  className="font-medium text-foreground hover:underline"
                >
                  {t("openEvent")}
                </Link>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {weekend.markets.map((market) => (
            <MarketBlock
              key={market.row.id}
              market={market}
              today={today}
              selected={vorschauId === market.row.id}
            />
          ))}
        </div>
      )}
      <section
        aria-labelledby="weekend-next-title"
        className="mt-auto border-border-subtle border-t px-4 py-3"
      >
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 id="weekend-next-title" className="m-0 font-semibold text-small">
            {t("next.title")}
          </h3>
          <span className="tabular text-muted-foreground text-small">{range(next)}</span>
        </div>
        {next.markets.length === 0 ? (
          <p className="m-0 mt-1 text-muted-foreground text-small">{t("next.empty")}</p>
        ) : (
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
            {next.markets.map(({ row, verdict }) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <MarketMarker color={row.color} typeKey={row.typeKey} />
                  <Link
                    href={`/veranstaltungen/${row.id}` as never}
                    className="min-w-0 break-words font-semibold hover:underline"
                  >
                    {row.name}
                  </Link>
                </span>
                <VerdictLine verdict={verdict} compact />
                <PeekLink eventId={row.id} name={row.name} className="-my-1 ml-auto" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Panel>
  );
}
