import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { DueBadge } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { formatDateRangeYear, formatDateShort, formatWeek } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DueItem } from "@/server/queries/due";
import type { Overview, WeekendBlock, WeekendMarket } from "@/server/queries/overview";
import { itemHref, itemPeek } from "./links";
import { VerdictLine } from "./verdict-line";

/** Blockers listed per market; more than two markets share the card, so they get fewer. */
function blockerRows(markets: number): number {
  return markets >= 3 ? 2 : 3;
}

const ROW =
  "flex cursor-pointer items-start gap-2 py-1.5 pr-4 pl-7 hover:bg-hover focus-visible:bg-selected";

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
  rows,
  selected,
}: {
  market: WeekendMarket;
  today: string;
  rows: number;
  selected: boolean;
}) {
  const t = await getTranslations("overview.weekend");
  const locale = await getLocale();
  const { row, verdict, blockers } = market;
  const href = `/veranstaltungen/${row.id}`;
  const shown = blockers.slice(0, rows);
  const more = blockers.length - shown.length;
  const reserveStar = shown.some((b) => b.isKey);
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
          "flex cursor-pointer flex-col gap-1 px-4 pt-3 pb-1.5 hover:bg-hover focus-visible:bg-selected",
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
        </span>
        <VerdictLine verdict={verdict} />
      </div>
      {shown.length > 0 && (
        <ul
          aria-label={t("blockers", { name: row.name })}
          className="m-0 flex list-none flex-col p-0 pb-2"
        >
          {shown.map((item) => (
            <Blocker
              key={`${item.kind}-${item.id}`}
              item={item}
              today={today}
              reserveStar={reserveStar}
            />
          ))}
          {more > 0 && (
            <li className="pl-7">
              <Link
                href={href as never}
                aria-label={t("blockersMoreAria", { count: more, name: row.name })}
                className="inline-flex min-h-8 items-center rounded-md px-1 font-medium text-muted-foreground text-small hover:text-foreground hover:underline"
              >
                {t("blockersMore", { count: more })}
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * "Dieses Wochenende", the first of the two questions on the Übersicht ("is the weekend on track?"): per
 * market one verdict line (Im Plan · Achtung · Nicht startklar, with the reasons) and the first blockers,
 * then one compact row for the weekend after. A market's name and "+ N weitere" open its Überblick.
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
  const rows = blockerRows(weekend.markets.length);
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
              rows={rows}
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </Panel>
  );
}
