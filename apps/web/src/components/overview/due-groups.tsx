import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock,
  type LucideIcon,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { TaskDoneButton } from "@/components/task/done-button";
import { SnoozeMenu } from "@/components/task/snooze";
import { DueBadge, dueLook } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { MarketMarker } from "@/components/ui/market-marker";
import { formatDateShortYear } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { DueItem, DueKind, DueUrgency } from "@/server/queries/due";
import { itemHref, itemPeek } from "./links";

const KIND_ICONS: Record<DueKind, LucideIcon> = {
  permit: ShieldCheck,
  installment: Wallet,
  task: CircleCheck,
  hours: Clock,
  obligation: Truck,
};

/** Each urgency group opens with a band in its status colour (colour + icon + text). */
const BAND: Record<DueUrgency, { icon: LucideIcon; className: string }> = {
  overdue: {
    icon: dueLook("overdue").icon,
    className: "border-status-critical-dot/30 bg-status-critical-bg text-status-critical",
  },
  today: {
    icon: dueLook("today").icon,
    className: "border-status-warn-dot/30 bg-status-warn-bg text-status-warn",
  },
  soon: { icon: CalendarDays, className: "border-border bg-status-neutral-bg text-foreground" },
  upcoming: { icon: ShieldCheck, className: "border-border bg-status-info-bg text-status-info" },
  waiting: {
    icon: dueLook("waiting").icon,
    className: "border-border bg-status-neutral-bg text-foreground",
  },
};

/** Items shown per market before "+ N weitere bei …", which opens the rest in place. */
export const DUE_PER_MARKET = 3;
/** Markets (and single items) shown per group before "+ N weitere Märkte", which opens the rest in place. */
export const DUE_PREVIEW_CLUSTERS = 10;

type Cluster = {
  event: {
    id: string;
    name: string;
    href: string;
    typeKey: string | null;
    color: string | null;
    startsOn: string | null;
  } | null;
  items: DueItem[];
};

/**
 * Items of one urgency group, bundled by market in ranking order (a market appears where its first item
 * ranks); items without a market stay single rows.
 */
function clusters(rows: DueItem[]): Cluster[] {
  const out: Cluster[] = [];
  const byEvent = new Map<string, Cluster>();
  for (const item of rows) {
    if (!item.eventId || !item.meta) {
      out.push({ event: null, items: [item] });
      continue;
    }
    let cluster = byEvent.get(item.eventId);
    if (!cluster) {
      cluster = {
        event: {
          id: item.eventId,
          name: item.meta,
          // Every link to a market opens its Überblick.
          href: item.metaHref ?? `/veranstaltungen/${item.eventId}`,
          typeKey: item.eventTypeKey ?? null,
          color: item.eventColor ?? null,
          startsOn: item.eventStartsOn ?? null,
        },
        items: [],
      };
      byEvent.set(item.eventId, cluster);
      out.push(cluster);
    }
    cluster.items.push(item);
  }
  return out;
}

/**
 * One due item. `nested` rows sit under their market's header and leave the market name out. Narrow
 * containers (below 28 rem) stack title and badge; the title never moves when a row has the
 * Kernaufgaben star (the slot is reserved for the whole list).
 */
function DueRow({
  item,
  today,
  canSnooze,
  nested,
  reserveStar,
}: {
  item: DueItem;
  today: string;
  canSnooze: boolean;
  nested: boolean;
  reserveStar: boolean;
}) {
  const t = useTranslations("overview.due");
  const href = itemHref(item);
  const Icon = KIND_ICONS[item.kind];
  const editable = item.kind === "task" && canSnooze;
  const meta = nested ? null : item.meta;
  const assignee =
    item.assigneeName && isModuleVisible("team")
      ? t("assignee", { name: item.assigneeName })
      : null;
  return (
    <li
      data-row
      data-href={href}
      data-peek={itemPeek(item)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
      tabIndex={0}
      className={cn(
        "grid cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-1.5 pr-4 hover:bg-hover focus-visible:bg-selected @md:flex @md:items-center",
        nested ? "pl-8" : "border-border-subtle border-b py-2 pl-4 last:border-b-0",
      )}
    >
      {editable ? (
        <TaskDoneButton task={{ id: item.id, title: item.title, status: "todo" }} />
      ) : (
        <span
          title={t(`kind.${item.kind}`)}
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-status-neutral-bg text-foreground-2"
        >
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{t(`kind.${item.kind}`)}</span>
        </span>
      )}
      <div className="min-w-0 @md:flex-1">
        <div className="flex items-start gap-1.5">
          {reserveStar && (
            <span className="mt-[3px] inline-flex w-4 shrink-0 justify-center">
              {item.isKey && <KeyTaskMark label={t("keyTask")} />}
            </span>
          )}
          <Link
            href={href as never}
            scroll={item.kind !== "task"}
            aria-label={t("openItem", { title: item.title })}
            className="min-w-0 break-words font-medium hover:underline"
          >
            {item.title}
          </Link>
        </div>
        {(meta || assignee) && (
          <span
            className={cn(
              "block break-words text-muted-foreground text-small",
              reserveStar && "pl-[22px]",
            )}
          >
            {meta && item.metaHref ? (
              <Link href={item.metaHref as never} className="hover:underline">
                {meta}
              </Link>
            ) : (
              meta
            )}
            {assignee && (
              <>
                {meta && " · "}
                {assignee}
              </>
            )}
          </span>
        )}
      </div>
      <div className="col-start-2 flex items-center gap-2 @md:col-auto @md:shrink-0">
        <DueBadge
          dueOn={item.dueOn}
          today={today}
          waiting={item.urgency === "waiting"}
          // What the week needs reads by day: "Sa 31.10. · In 2 Tagen".
          withDate={item.urgency === "soon" || item.urgency === "upcoming"}
        />
        {editable && (
          <SnoozeMenu task={{ id: item.id, title: item.title, status: "todo" }} today={today} />
        )}
      </div>
    </li>
  );
}

const MORE =
  "inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1 font-medium text-muted-foreground text-small hover:text-foreground [&::-webkit-details-marker]:hidden";

/** "+ N weitere …": a native disclosure, so the rest opens in place (no navigation, works without JS). */
export function MoreDisclosure({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details className={cn("group", className)}>
      <summary className={MORE}>
        <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
        {label}
      </summary>
      {children}
    </details>
  );
}

function MarketCluster({
  cluster,
  today,
  canSnooze,
  reserveStar,
}: {
  cluster: Cluster & { event: NonNullable<Cluster["event"]> };
  today: string;
  canSnooze: boolean;
  reserveStar: boolean;
}) {
  const t = useTranslations("overview.due");
  const { event, items } = cluster;
  const row = (item: DueItem) => (
    <DueRow
      key={`${item.kind}-${item.id}`}
      item={item}
      today={today}
      canSnooze={canSnooze}
      nested
      reserveStar={reserveStar}
    />
  );
  return (
    <li className="border-border-subtle border-b last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 pt-3 pb-1">
        <MarketMarker color={event.color} typeKey={event.typeKey} />
        <Link
          href={event.href as never}
          className="min-w-0 break-words font-semibold hover:underline"
        >
          {event.name}
        </Link>
        {event.startsOn && <MarketDate date={event.startsOn} today={today} />}
        <span className="tabular text-muted-foreground text-small">
          · {t("eventCount", { count: items.length })}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0 pb-1.5">
        {items.slice(0, DUE_PER_MARKET).map(row)}
        {items.length > DUE_PER_MARKET && (
          <li className="list-none">
            <MoreDisclosure
              className="pl-7"
              label={t("moreAtMarket", { count: items.length - DUE_PER_MARKET, name: event.name })}
            >
              <ul className="m-0 -ml-7 flex list-none flex-col p-0">
                {items.slice(DUE_PER_MARKET).map(row)}
              </ul>
            </MoreDisclosure>
          </li>
        )}
      </ul>
    </li>
  );
}

async function MarketDate({ date, today }: { date: string; today: string }) {
  const locale = await getLocale();
  return (
    <span className="tabular text-muted-foreground text-small">
      {formatDateShortYear(date, locale, today)}
    </span>
  );
}

/**
 * Due items by urgency group (Überfällig · Heute · Diese Woche · Genehmigungen demnächst · Wartet), each
 * group bundled per market in ranking order. A market shows its first three items and a group its first
 * ten markets; "+ N weitere" opens the rest in place. `bandless` groups skip their band (the panel title
 * already names them).
 */
export async function DueGroups({
  items,
  groups,
  today,
  canSnooze,
  bandless = [],
}: {
  items: DueItem[];
  groups: DueUrgency[];
  today: string;
  canSnooze: boolean;
  bandless?: DueUrgency[];
}) {
  const t = await getTranslations("overview.due");
  const reserveStar = items.some((i) => i.isKey);
  const render = (cluster: Cluster) =>
    cluster.event ? (
      <MarketCluster
        key={`event-${cluster.event.id}`}
        cluster={cluster as Cluster & { event: NonNullable<Cluster["event"]> }}
        today={today}
        canSnooze={canSnooze}
        reserveStar={reserveStar}
      />
    ) : (
      cluster.items.map((item) => (
        <DueRow
          key={`${item.kind}-${item.id}`}
          item={item}
          today={today}
          canSnooze={canSnooze}
          nested={false}
          reserveStar={reserveStar}
        />
      ))
    );
  return (
    <div className="@container flex flex-col">
      {groups.map((urgency) => {
        const rows = items.filter((i) => i.urgency === urgency);
        if (rows.length === 0) return null;
        const all = clusters(rows);
        const shown = all.slice(0, DUE_PREVIEW_CLUSTERS);
        const hidden = all.slice(DUE_PREVIEW_CLUSTERS);
        const Band = BAND[urgency].icon;
        return (
          // A group without its own band is named by the panel around it (no second landmark of that name).
          <section
            key={urgency}
            aria-label={bandless.includes(urgency) ? undefined : t(`groups.${urgency}`)}
          >
            {!bandless.includes(urgency) && (
              <h3
                className={cn(
                  "m-0 flex items-center gap-2 border-y px-4 py-2 font-semibold text-body",
                  BAND[urgency].className,
                )}
              >
                <Band aria-hidden className="size-4 shrink-0" />
                {t(`groups.${urgency}`)}
                <span className="tabular inline-grid h-5 min-w-6 place-items-center rounded-full bg-card/80 px-1.5 font-semibold text-tiny">
                  {rows.length}
                </span>
              </h3>
            )}
            <ul className="m-0 flex list-none flex-col p-0">
              {shown.map(render)}
              {hidden.length > 0 && (
                <li className="list-none border-border-subtle border-t px-3 py-1">
                  <MoreDisclosure label={t("moreMarkets", { count: hidden.length })}>
                    <ul className="m-0 -mx-3 flex list-none flex-col border-border-subtle border-t p-0">
                      {hidden.map(render)}
                    </ul>
                  </MoreDisclosure>
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
