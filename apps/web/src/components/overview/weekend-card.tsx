import { ArrowRight, CircleAlert, CircleCheck, ListChecks, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel, panelActionLink } from "@/components/ui/panel";
import { rowFocus } from "@/components/ui/table";
import { formatDateRangeYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WeekendMarket } from "@/server/queries/overview";
import { PeekLink } from "./peek-link";

type Checklist = NonNullable<WeekendMarket["checklist"]>;

/** Status of a Checkliste: colour + icon + text (overdue tasks win over "all done"). */
function checklistLook(c: Checklist) {
  if (c.overdue > 0)
    return { icon: CircleAlert, text: "text-status-critical", bar: "bg-status-critical-dot" };
  if (c.total > 0 && c.done === c.total)
    return { icon: CircleCheck, text: "text-status-ok", bar: "bg-status-ok-dot" };
  return { icon: ListChecks, text: "text-foreground-2", bar: "bg-primary" };
}

/** "12 von 20 erledigt" with a small meter, plus "· 3 überfällig" in red when tasks are overdue. */
function ChecklistStatus({ checklist, name }: { checklist: Checklist; name: string }) {
  const t = useTranslations("overview.weekend");
  if (checklist.total === 0)
    return <p className="m-0 text-muted-foreground text-small">{t("checklist.none")}</p>;
  const look = checklistLook(checklist);
  const Icon = look.icon;
  const percent = Math.round((checklist.done / checklist.total) * 100);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        role="progressbar"
        aria-label={t("checklist.label", { name })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="block h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-card"
      >
        <span
          className={cn("block h-full rounded-full", look.bar)}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className={cn("inline-flex items-center gap-1 text-small", look.text)}>
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="tabular">
          {t("checklist.done", { done: checklist.done, total: checklist.total })}
        </span>
        {checklist.overdue > 0 && (
          <span className="tabular font-medium">
            · {t("checklist.overdue", { count: checklist.overdue })}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * One event of the box: name (opens the event), the eye for its Vorschau, date · Ort, the Checkliste status
 * and, only when some are missing, "N Genehmigungen fehlen" in red (the rule of "Was fehlt"). A J/K row like every other on the Übersicht (Enter opens the event, Space its Vorschau).
 */
async function EventItem({
  market,
  today,
  selected,
}: {
  market: WeekendMarket;
  today: string;
  selected: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations("overview.weekend");
  const { row, checklist, permitsMissing } = market;
  const href = `/veranstaltungen/${row.id}`;
  return (
    <li
      data-row
      data-href={href}
      data-peek={`/?vorschau=${row.id}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
      tabIndex={0}
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 hover:bg-card/70",
        rowFocus,
        selected && "bg-card",
      )}
    >
      <span className="flex items-center gap-2">
        <MarketMarker color={row.color} typeKey={row.typeKey} />
        <h3 id={`weekend-${row.id}`} className="m-0 min-w-0 break-words font-semibold text-body">
          <Link href={href as never} tabIndex={-1} className="hover:underline">
            {row.name}
          </Link>
        </h3>
        <PeekLink eventId={row.id} name={row.name} className="-my-1 ml-auto" />
      </span>
      <span className="tabular text-foreground-2 text-small">
        {formatDateRangeYear(row.startsOn, row.endsOn, locale, today)}
        {row.venueName && <> · {row.venueName}</>}
      </span>
      {checklist && <ChecklistStatus checklist={checklist} name={row.name} />}
      {permitsMissing > 0 && (
        <span className="inline-flex items-center gap-1 font-medium text-small text-status-critical">
          <ShieldAlert aria-hidden className="size-3.5 shrink-0" />
          <span className="tabular">{t("permitsMissing", { count: permitsMissing })}</span>
        </span>
      )}
    </li>
  );
}

/**
 * "Dieses Wochenende" (decision 2026-11-13): an information box, not a task list. A tinted card without row
 * lines that names the weekend's events (name, date, Ort) with how far each Checkliste is, and links to all
 * events. With nothing planned this weekend it shows the next events instead, with one line saying so. The
 * tasks themselves live in "Heute & nächste Tage".
 */
export async function WeekendCard({
  weekend,
  nextEvents,
  today,
  vorschauId,
  className,
}: {
  weekend: WeekendMarket[];
  /** The next events when the weekend has none (`Overview.nextEvents`). */
  nextEvents: WeekendMarket[];
  today: string;
  vorschauId?: string;
  className?: string;
}) {
  const t = await getTranslations("overview.weekend");
  const empty = weekend.length === 0;
  const shown = empty ? nextEvents : weekend;
  return (
    <Panel
      title={t("title")}
      titleId="weekend-title"
      className={className}
      cardClassName="border-transparent bg-accent-soft p-1.5"
      actions={
        <Link href="/veranstaltungen" className={panelActionLink}>
          {t("all")}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      }
    >
      {empty && (
        <p className="m-0 px-3 pt-2 pb-1 text-foreground-2 text-small">
          {nextEvents.length > 0 ? t("emptyNext") : t("emptyNone")}
        </p>
      )}
      {shown.length > 0 && (
        <ul
          aria-label={empty ? t("nextLabel") : t("title")}
          className="m-0 flex list-none flex-col gap-0.5 p-0"
        >
          {shown.map((market) => (
            <EventItem
              key={market.row.id}
              market={market}
              today={today}
              selected={vorschauId === market.row.id}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
