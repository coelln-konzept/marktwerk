"use client";

import { canMoveEvent, daysBetween, isoWeek } from "@marktwerk/core";
import { Eye, MapPin } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";
import type { TypeChoice } from "@/components/event-detail/basics-dialog";
import { EventActions } from "@/components/event-detail/event-actions";
import { EventStatusBadge } from "@/components/events/event-status";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { MarketMarker } from "@/components/ui/market-marker";
import { LinkRow } from "@/components/ui/row-link";
import { RowActions, rowFocus, TD, TGroup } from "@/components/ui/table";
import { formatDateRangeYear, formatMonth } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import type { EventStatus } from "@/lib/status";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { VenueOption } from "@/server/queries/venues";

const PATH = "/veranstaltungen";

/** What one row of the Veranstaltungen list needs, nothing more. */
export type EventListRow = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: EventStatus;
  typeKey: string;
  typeName: string;
  color: string | null;
  venueId: string;
  venueName: string;
  eventTypeId: string;
};

/**
 * The rows of the Veranstaltungen list (with the month headers when sorted by date). A client component
 * on purpose: the server sends each row as a few plain fields instead of its whole rendered tree, which
 * roughly halves what a long list weighs (UX-069). Below 640 px every row becomes a 2-line card.
 */
export function EventRows({
  rows,
  query,
  monthHeaders,
  perMonth,
  today,
  vorschauId,
  actions,
}: {
  rows: EventListRow[];
  /** The page's search params; row links keep them. */
  query: Record<string, string>;
  monthHeaders: boolean;
  /** Termine per month ("2027-03") over all matches, not only this page. */
  perMonth: Record<string, number>;
  today: string;
  vorschauId?: string;
  /** The "…" menu per row (event:write). */
  actions?: { canDelete: boolean; venues: VenueOption[]; types: TypeChoice[] };
}) {
  const t = useTranslations("events");
  const locale = useLocale();
  const estimates = isModuleVisible("estimates");
  const columns = estimates ? 8 : 7;
  let openMonth = "";

  return rows.map((r) => {
    const href = `${PATH}/${r.id}`;
    const peek = hrefWith(PATH, query, { vorschau: r.id, erzeugen: undefined });
    const month = r.startsOn.slice(0, 7);
    const header =
      monthHeaders && month !== openMonth ? (
        <TGroup colSpan={columns}>
          {formatMonth(r.startsOn, locale)} · {t("groupCount", { count: perMonth[month] ?? 0 })}
        </TGroup>
      ) : null;
    openMonth = month;
    return (
      <Fragment key={r.id}>
        {header}
        <LinkRow
          href={href}
          tabIndex={0}
          data-row
          data-href={href}
          data-peek={peek}
          aria-current={vorschauId === r.id}
          className={cn(
            rowFocus,
            "max-sm:grid max-sm:grid-cols-[auto_auto_1fr_auto] max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-0.5 max-sm:px-3 max-sm:py-2.5",
            r.status === "cancelled" && "text-muted-foreground",
          )}
        >
          <TD className="tabular text-muted-foreground max-sm:col-start-2 max-sm:row-start-2 max-sm:h-auto max-sm:p-0 max-sm:text-small">
            <span className="sm:hidden">{t("cols.week")} </span>
            {isoWeek(r.startsOn).week}
          </TD>
          <TD className="tabular whitespace-nowrap font-semibold max-sm:col-start-1 max-sm:row-start-2 max-sm:h-auto max-sm:p-0 max-sm:text-small">
            {formatDateRangeYear(r.startsOn, r.endsOn, locale, today)}
          </TD>
          <TD className="max-sm:col-span-3 max-sm:col-start-1 max-sm:row-start-1 max-sm:h-auto max-sm:min-w-0 max-sm:p-0">
            <span className="inline-flex items-center gap-2">
              <MarketMarker color={r.color} typeKey={r.typeKey} shape="dot" />
              <Link
                href={href as never}
                tabIndex={-1}
                className="whitespace-nowrap font-semibold text-accent-soft-foreground hover:underline max-sm:whitespace-normal"
              >
                {r.name}
              </Link>
            </span>
          </TD>
          <TD className="max-sm:hidden">
            <EventTypeTag typeKey={r.typeKey}>{r.typeName}</EventTypeTag>
          </TD>
          <TD
            className="max-w-64 truncate max-sm:col-start-3 max-sm:row-start-2 max-sm:h-auto max-sm:min-w-0 max-sm:max-w-none max-sm:p-0 max-sm:text-small max-sm:text-muted-foreground max-sm:before:mr-2 max-sm:before:content-['·']"
            title={r.venueName}
          >
            <Link
              href={hrefWith(PATH, query, { ort: r.venueId, vorschau: undefined }) as never}
              scroll={false}
              tabIndex={-1}
              title={t("venueOnly", { name: r.venueName })}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-small hover:bg-hover hover:underline max-sm:bg-transparent max-sm:p-0"
            >
              <MapPin aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{r.venueName}</span>
            </Link>
          </TD>
          <TD className="max-sm:col-start-4 max-sm:row-start-1 max-sm:h-auto max-sm:p-0">
            <EventStatusBadge status={r.status} />
          </TD>
          {estimates && (
            <TD className="tabular text-right text-muted-foreground max-sm:hidden">–</TD>
          )}
          <TD className="w-24 max-sm:hidden">
            <RowActions>
              <Link
                href={peek as never}
                scroll={false}
                tabIndex={-1}
                aria-label={t("preview", { name: r.name })}
                className="grid size-7 place-items-center rounded-md hover:bg-hover"
              >
                <Eye className="size-4" />
              </Link>
              {actions && (
                <EventActions
                  eventId={r.id}
                  eventName={r.name}
                  status={r.status}
                  startsOn={r.startsOn}
                  canMove={canMoveEvent(r.status)}
                  canDelete={actions.canDelete}
                  venues={actions.venues}
                  types={actions.types}
                  basics={{
                    name: r.name,
                    durationDays: daysBetween(r.startsOn, r.endsOn) + 1,
                    venueId: r.venueId,
                    eventTypeId: r.eventTypeId,
                  }}
                  triggerClassName="grid size-7 cursor-pointer place-items-center rounded-md text-foreground-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
                />
              )}
            </RowActions>
          </TD>
        </LinkRow>
      </Fragment>
    );
  });
}
