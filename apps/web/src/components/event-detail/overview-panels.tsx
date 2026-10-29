import {
  daysBetween,
  isHappening,
  type OverviewPermit,
  permitStateForEvent,
  splitTimeline,
} from "@marktwerk/core";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  ListChecks,
  NotebookText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { PermitStateBadge } from "@/components/permits/permit-state-badge";
import { formatPermitTitle } from "@/components/permits/permit-title";
import { useDueText } from "@/components/ui/due-badge";
import { Health } from "@/components/ui/health";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import {
  formatDateShort,
  formatDateWithWeekday,
  formatMoney,
  formatNumber,
  todayIn,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventOverview } from "@/server/queries/event-overview";
import type { EventDetail } from "@/server/queries/events";
import { FactsDialog } from "./facts-dialog";
import { KeyTaskItem, MissingTaskRow } from "./overview-rows";
import { roleName } from "./role-name";

const ANCHOR_ORDER = ["event_day", "setup_day", "teardown_day", "booking_cutoff"] as const;

// ---------------------------------------------------------------------------------------------
// 1. Status line

// Each cell: a title line and a support line (date, progress bar), the same height in all three.
const statusLink =
  "group flex min-w-0 flex-col justify-between gap-1.5 px-4 py-3 hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function ProgressBar({ label, ratio }: { label: string; ratio: number }) {
  const percent = Math.round(ratio * 100);
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="block h-1.5 overflow-hidden rounded-full bg-status-neutral-bg"
    >
      <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </span>
  );
}

/**
 * Status line: days until the market, tasks done with a slim bar, permits granted. Every piece links to
 * the place it summarises (Termine below, Board tab, Genehmigungen tab).
 */
export async function StatusLine({
  event,
  overview,
}: {
  event: EventDetail;
  overview: EventOverview;
}) {
  const t = await getTranslations("eventDetail.overview.status");
  const locale = await getLocale();
  const base = `/veranstaltungen/${event.id}`;
  const { tasks, permits } = overview;
  const c = overview.countdown;
  const countdown =
    c.kind === "running"
      ? t("running")
      : c.kind === "over"
        ? t("over")
        : c.days === 1
          ? t("tomorrow")
          : t("upcoming", { n: c.days });
  const ratio = tasks && tasks.progress.total > 0 ? tasks.progress.ratio : 0;
  return (
    <Panel aria-label={t("label")}>
      <div className="grid divide-y divide-border-subtle overflow-hidden rounded-xl sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Link href={"#termine" as never} className={statusLink}>
          <span className="flex items-center gap-2 font-semibold text-[17px]">
            <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
            {countdown}
          </span>
          <span className="tabular text-muted-foreground text-small">
            {t("countdownDate", { date: formatDateWithWeekday(event.startsOn, locale) })}
          </span>
        </Link>
        {tasks && (
          <Link href={`${base}/board` as never} className={statusLink}>
            <span className="flex items-center gap-2 font-semibold text-[17px]">
              <ListChecks aria-hidden className="size-4 text-muted-foreground" />
              {tasks.progress.total === 0
                ? t("tasksNone")
                : t("tasks", { done: tasks.progress.done, total: tasks.progress.total })}
            </span>
            <ProgressBar label={t("progress")} ratio={ratio} />
          </Link>
        )}
        {permits && (
          <Link href={`${base}/genehmigungen` as never} className={statusLink}>
            <span className="flex items-center gap-2 font-semibold text-[17px]">
              <ShieldCheck aria-hidden className="size-4 text-muted-foreground" />
              {permits.progress.total === 0
                ? t("permitsNone")
                : t("permits", {
                    granted: permits.progress.granted,
                    total: permits.progress.total,
                  })}
            </span>
            <ProgressBar
              label={t("permitsProgress")}
              ratio={
                permits.progress.total > 0 ? permits.progress.granted / permits.progress.total : 0
              }
            />
          </Link>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Was fehlt

/**
 * "Was fehlt": the open tasks that are overdue, blocked / waiting or due in the next 7 days, then the
 * required permits that are not granted. Key tasks first. Quick "Erledigt" and snooze with undo toasts.
 */
/** Rows of "Was fehlt" before the rest of the next seven days folds away. */
const MISSING_VISIBLE_ROWS = 8;

export async function MissingPanel({
  event,
  overview,
  today,
  canWrite,
}: {
  event: EventDetail;
  overview: EventOverview;
  today: string;
  canWrite: boolean;
}) {
  const t = await getTranslations("eventDetail.overview.missing");
  const locale = await getLocale();
  const tasks = overview.tasks?.missing ?? [];
  const permits: OverviewPermit[] = overview.permits?.missing ?? [];
  const empty = tasks.length === 0 && permits.length === 0;
  // Urgent rows (overdue, blocked, waiting, due today) and Kernaufgaben always show; the rest of the
  // next seven days folds away once the list gets long, so the urgent part stays on screen.
  const urgent = tasks.filter((task) => task.reason !== "soon" || task.isKey);
  const soon = tasks.filter((task) => task.reason === "soon" && !task.isKey);
  const room = Math.max(0, MISSING_VISIBLE_ROWS - urgent.length);
  const shown = [...urgent, ...soon.slice(0, room)];
  const folded = soon.slice(room);
  const row = (task: (typeof tasks)[number]) => (
    <MissingTaskRow
      key={task.id}
      eventId={event.id}
      task={task}
      today={today}
      canWrite={canWrite}
    />
  );
  return (
    <Panel aria-labelledby="missing-title">
      <PanelHeader>
        <PanelTitle id="missing-title">{t("title")}</PanelTitle>
        <span className="text-muted-foreground text-small">{t("hint")}</span>
      </PanelHeader>
      {empty ? (
        <EmptyState icon={CircleCheck} title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {shown.map(row)}
          {permits.map((p) => {
            // The permit opens in its drawer on this page (`?genehmigung=`), so the event stays in view.
            const href = `/veranstaltungen/${event.id}?genehmigung=${p.id}` as never;
            return (
              <li
                key={p.id}
                data-row
                data-href={href}
                className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-border-subtle border-b px-4 py-1.5 last:border-b-0 hover:bg-hover focus-visible:bg-selected focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <Link
                  href={href}
                  scroll={false}
                  className="flex min-w-0 basis-full items-center gap-2 font-medium hover:underline sm:basis-0 sm:flex-1 sm:truncate"
                >
                  <ShieldCheck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="sr-only">{t("permitKind")}: </span>
                  {formatPermitTitle(p.title, locale)}
                </Link>
                <PermitStateBadge state={permitStateForEvent(p, event, today)} />
                {p.applyBy && (
                  <span className="tabular text-muted-foreground text-small">
                    {t("permitApplyBy", { date: formatDateShort(p.applyBy, locale) })}
                  </span>
                )}
              </li>
            );
          })}
          {folded.length > 0 && (
            <li className="border-border-subtle border-t">
              <details className="group">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 py-2 font-medium text-muted-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 transition-transform group-open:rotate-90"
                  />
                  {t("more", { count: folded.length })}
                </summary>
                <ul className="m-0 flex list-none flex-col border-border-subtle border-t p-0">
                  {folded.map(row)}
                </ul>
              </details>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Kernaufgaben

/** "Kernaufgaben": a compact checklist of the event's key tasks; the star marks the heading only. */
export async function KeyTasksPanel({
  event,
  overview,
  today,
  canWrite,
}: {
  event: EventDetail;
  overview: EventOverview;
  today: string;
  canWrite: boolean;
}) {
  const t = await getTranslations("eventDetail.overview.key");
  const rows = overview.tasks?.key ?? [];
  return (
    <Panel aria-labelledby="key-title">
      <PanelHeader>
        <PanelTitle id="key-title" className="flex items-center gap-2">
          <KeyTaskMark />
          {t("title")}
        </PanelTitle>
      </PanelHeader>
      {rows.length === 0 ? (
        <PanelBody className="text-muted-foreground text-small">{t("empty")}</PanelBody>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => (
            <KeyTaskItem
              key={row.id}
              eventId={event.id}
              row={row}
              today={today}
              canWrite={canWrite}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Nächste Termine

/** "Morgen", "In 3 Tagen", "Heute"; a past date reads "vor 3 Tagen" (it is not overdue, it happened). */
function RelativeDay({ date, today }: { date: string; today: string }) {
  const t = useTranslations("eventDetail.overview.dates");
  const dueText = useDueText();
  const n = daysBetween(today, date);
  return <>{n < 0 ? t("daysAgo", { n: -n }) : dueText(date, today)}</>;
}

/** "Nächste Termine": the named dates of the event, upcoming first; past ones muted and collapsed. */
export async function DatesPanel({ event, today }: { event: EventDetail; today: string }) {
  const t = await getTranslations("eventDetail.overview.dates");
  const locale = await getLocale();
  const byKey = new Map(event.anchors.map((a) => [a.key, a.date]));
  // Older data may lack the teardown anchor: the last event day is the teardown day then.
  if (!byKey.has("teardown_day")) byKey.set("teardown_day", event.endsOn);
  const known = ANCHOR_ORDER.flatMap((key) => {
    const date = byKey.get(key);
    return date ? [{ key, date }] : [];
  });
  const custom = event.anchors.filter((a) => !(ANCHOR_ORDER as readonly string[]).includes(a.key));
  const { upcoming, past } = splitTimeline(
    [...known, ...custom.map((a) => ({ key: a.key, date: a.date }))],
    today,
  );

  const label = (key: string) => (t.has(`keys.${key}` as never) ? t(`keys.${key}` as never) : key);
  const row = (d: { key: string; date: string }, muted: boolean) => (
    <li
      key={`${d.key}-${d.date}`}
      className={cn(
        "flex items-baseline gap-3 border-border-subtle border-b px-4 py-1.5 last:border-b-0",
        muted && "text-muted-foreground",
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate", !muted && "font-medium")}>{label(d.key)}</span>
      <span className="tabular whitespace-nowrap text-small">
        {formatDateWithWeekday(d.date, locale)}
      </span>
      <span className="tabular whitespace-nowrap text-right text-small text-foreground-2 sm:w-28">
        <RelativeDay date={d.date} today={today} />
      </span>
    </li>
  );

  return (
    <Panel id="termine" aria-labelledby="dates-title" className="scroll-mt-4">
      <PanelHeader>
        <PanelTitle id="dates-title">{t("title")}</PanelTitle>
      </PanelHeader>
      {upcoming.length + past.length === 0 ? (
        <PanelBody className="text-muted-foreground text-small">{t("empty")}</PanelBody>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {upcoming.map((d) => row(d, false))}
            </ul>
          ) : (
            <p className="px-4 py-2.5 text-muted-foreground text-small">{t("nothingAhead")}</p>
          )}
          {past.length > 0 && (
            <details className="group border-border-subtle border-t">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-4 text-muted-foreground text-small hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden
                  className="size-4 transition-transform group-open:rotate-90"
                />
                {t("pastToggle", { count: past.length })}
              </summary>
              <ul className="m-0 flex list-none flex-col border-border-subtle border-t p-0">
                {past.map((d) => row(d, true))}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// 4b. Notiz

/** Longest note shown on the Überblick; the rest is behind the link to Notizen. */
const NOTE_EXCERPT_CHARS = 280;

/**
 * "Notiz": what the team should know about this market, so a note is not hidden two clicks away
 * (Mehr → Notizen). Nothing is shown while there is no note.
 */
export async function NotesExcerpt({ event }: { event: EventDetail }) {
  const text = event.notes?.trim();
  if (!text) return null;
  const t = await getTranslations("eventDetail.overview.notes");
  const excerpt =
    text.length > NOTE_EXCERPT_CHARS ? `${text.slice(0, NOTE_EXCERPT_CHARS).trimEnd()} …` : text;
  return (
    <Panel aria-labelledby="note-title">
      <PanelHeader>
        <PanelTitle id="note-title" className="flex items-center gap-2">
          <NotebookText aria-hidden className="size-4 text-muted-foreground" />
          {t("title")}
        </PanelTitle>
        <Link
          href={`/veranstaltungen/${event.id}/notizen` as never}
          className="inline-flex items-center gap-1 text-accent-soft-foreground text-small hover:underline"
        >
          {t("link")}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </PanelHeader>
      <PanelBody className="line-clamp-4 whitespace-pre-line break-words text-foreground-2">
        {excerpt}
      </PanelBody>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// 5. Eckdaten and Regeln der Art (collapsed)

function Disclosure({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <Panel aria-labelledby={id}>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          />
          <h2 id={id} className="font-semibold text-[15px]">
            {title}
          </h2>
          <span className="min-w-0 flex-1 truncate text-muted-foreground text-small group-open:hidden">
            {summary}
          </span>
        </summary>
        <div className="border-border-subtle border-t">{children}</div>
      </details>
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-border-subtle border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground text-small">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** "Eckdaten": venue, times and prices; collapsed with a one-line summary, editable with event:write. */
export async function FactsPanel({ event, canWrite }: { event: EventDetail; canWrite: boolean }) {
  const t = await getTranslations("eventDetail.overview.facts");
  const tHeader = await getTranslations("eventDetail.header");
  const locale = await getLocale();
  const { venue, times } = event;
  const address = [venue.street, [venue.postalCode, venue.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return (
    <Disclosure
      id="facts-title"
      title={t("title")}
      summary={t("summary", {
        venue: venue.name,
        open: times.open,
        close: times.close,
        price: formatMoney(event.pricePerMCents, locale),
      })}
    >
      <PanelBody>
        {canWrite && (
          <div className="mb-3 flex justify-end">
            <FactsDialog
              eventId={event.id}
              multiDay={event.endsOn !== event.startsOn}
              happening={isHappening(event, todayIn())}
              facts={{
                times: event.times,
                pricePerMCents: event.pricePerMCents,
                bookingFeeCents: event.bookingFeeCents,
              }}
            />
          </div>
        )}
        <dl>
          <Fact label={t("venue")}>
            <Link
              href={`/orte/${venue.id}` as never}
              className="font-medium underline-offset-2 hover:underline"
            >
              {venue.name}
            </Link>
            <span className="block text-muted-foreground text-small">{address}</span>
          </Fact>
          <Fact label={t("preset")}>
            {event.preset ? (
              <Link
                href={`/einstellungen/bibliothek?vorschau=${event.preset.id}` as never}
                className="font-medium underline-offset-2 hover:underline"
              >
                {event.preset.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">{tHeader("noPreset")}</span>
            )}
          </Fact>
          <Fact label={t("times")}>
            <span className="tabular">
              {t("timesValue", {
                setup: times.setup,
                open: times.open,
                close: times.close,
                teardown: times.teardown,
              })}
            </span>
          </Fact>
          <Fact label={t("price")}>
            <span className="tabular">
              {t("pricePerM", { price: formatMoney(event.pricePerMCents, locale) })}
            </span>
          </Fact>
          <Fact label={t("fee")}>
            <span className="tabular">{formatMoney(event.bookingFeeCents, locale)}</span>
          </Fact>
          {event.status === "cancelled" && event.cancelledReason && (
            <Fact label={t("cancelledReason")}>{event.cancelledReason}</Fact>
          )}
        </dl>
      </PanelBody>
    </Disclosure>
  );
}

/** "Regeln der Art": new-goods share, banned goods, online booking; collapsed with a one-line summary. */
export async function RulesPanel({ event }: { event: EventDetail }) {
  const t = await getTranslations("eventDetail.overview.rules");
  const tFacts = await getTranslations("eventDetail.overview.facts");
  const locale = await getLocale();
  const rules = event.type.rules;
  const share = formatNumber(Math.round(rules.newGoodsMaxShare * 100), locale, 0);
  const online = rules.onlineBookingAllowed ? tFacts("yes") : tFacts("no");
  return (
    <Disclosure
      id="rules-title"
      title={t("title")}
      summary={t("summary", {
        share,
        online,
        banned:
          rules.bannedGoods.length > 0
            ? t("bannedCount", { count: rules.bannedGoods.length })
            : t("noBanned"),
      })}
    >
      <PanelBody>
        <ul className="flex flex-col gap-0.5">
          <li>{tFacts("newGoods", { share })}</li>
          <li>
            {rules.bannedGoods.length > 0
              ? tFacts("bannedGoods", { goods: rules.bannedGoods.join(", ") })
              : tFacts("noBannedGoods")}
          </li>
          <li>{tFacts("onlineBooking", { value: online })}</li>
        </ul>
      </PanelBody>
    </Disclosure>
  );
}

/** "Team" summary: duties filled x/y with health, the open ones named, link to the Team tab. */
export async function TeamSummaryPanel({ event }: { event: EventDetail }) {
  const t = await getTranslations("eventDetail.overview.team");
  const tHealth = await getTranslations("health");
  const locale = await getLocale();
  const total = event.duties.length;
  const open = event.duties.filter((d) => !d.staffMemberId);
  const assigned = total - open.length;
  const level = event.health.team ?? "none";
  return (
    <Panel aria-labelledby="team-title">
      <PanelHeader>
        <PanelTitle id="team-title">{t("title")}</PanelTitle>
        <Link
          href={`/veranstaltungen/${event.id}/team` as never}
          className="inline-flex items-center gap-1 text-accent-soft-foreground text-small hover:underline"
        >
          {t("link")}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-2">
        <Health level={level} label={`${t("summary", { assigned, total })} · ${tHealth(level)}`} />
        <p className="text-foreground-2 text-small">
          {open.length === 0
            ? t("allSet")
            : t("open", { roles: open.map((d) => roleName(d, locale)).join(", ") })}
        </p>
      </PanelBody>
    </Panel>
  );
}
