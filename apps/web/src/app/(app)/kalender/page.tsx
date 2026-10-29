import {
  addDays,
  daysBetween,
  daysInMonth,
  holidaysBetween,
  isIsoDate,
  isoDate,
  mondayOf,
  weekendsTouched,
} from "@marktwerk/core";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DeadlineChip, LAYER_ICONS } from "@/components/kalender/deadline-chip";
import { EventChip } from "@/components/kalender/event-chip";
import {
  type DisplayItem,
  deadlineKind,
  deadlineText,
  groupDeadlines,
} from "@/components/kalender/group-deadlines";
import { LayerPanel } from "@/components/kalender/layer-panel";
import {
  availableLayers,
  DEFAULT_LAYERS,
  KAL_PHONE_COOKIE,
  layerParams,
  layersChangedCount,
  parseLayers,
} from "@/components/kalender/layers";
import { CalendarList } from "@/components/kalender/list-view";
import { MonthGrid } from "@/components/kalender/month-grid";
import { MonthJump } from "@/components/kalender/month-jump";
import { KalenderShortcuts } from "@/components/kalender/shortcuts";
import { ViewDefault } from "@/components/kalender/view-default";
import { Page, PageHeader } from "@/components/shell/page";
import { EVENT_TYPE_KEYS, EventTypeSquare } from "@/components/ui/event-type-tag";
import { Kbd } from "@/components/ui/kbd";
import { Panel } from "@/components/ui/panel";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { formatDate, formatMonth, todayIn } from "@/lib/format";
import { HIDDEN_MODULES, isModuleVisible } from "@/lib/modules";
import { EVENT_STATUS } from "@/lib/status";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  getSavedLayers,
  listCalendarDeadlines,
  listCalendarEvents,
  listVenueOptions,
} from "@/server/queries/kalender";
import { requirePermission } from "@/server/session";
import { getUiState } from "@/server/ui-state";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("calendar") };
}

const PATH = "/kalender";
const LIST_DAYS = 42;

export default async function KalenderPage({ searchParams }: PageProps<"/kalender">) {
  await requirePermission("event", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("kalenderPage");
  const tNav = await getTranslations("nav");
  const tCal = await getTranslations("calendar");
  const tStatus = await getTranslations("status.event");
  const locale = await getLocale();
  const today = todayIn();

  // Layers: explicit in the URL, else the person's saved selection, else everything on.
  const canMine = actor.staffMemberId !== null && isModuleVisible("team");
  const chosen = parseLayers(sp) ?? (await getSavedLayers(actor.id)) ?? DEFAULT_LAYERS;
  // "Nur meine Zuständigkeit" is not offered without Team: a saved selection must not narrow silently.
  const layers = canMine ? chosen : { ...chosen, mine: false };
  const layersOpen = await getUiState("calendarLayers");

  // View: an explicit `?ansicht=` always wins. Without one phones (below md) open in Liste and wider
  // screens in Monat (decision 2026-10-28); the width comes from a cookie that `ViewDefault` keeps in
  // step, so only the view that is shown gets fetched.
  const ansicht = param(sp.ansicht);
  const explicitView = ansicht === "liste" || ansicht === "monat" ? ansicht : undefined;
  const phoneCookie = (await cookies()).get(KAL_PHONE_COOKIE)?.value;
  const assumedPhone = phoneCookie === "1";
  const view = explicitView ?? (assumedPhone ? "liste" : "monat");

  const monthParam = param(sp.monat);
  const month =
    monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const monthFirst = isoDate(y, m, 1);
  const monthLast = isoDate(y, m, daysInMonth(y, m));
  const abParam = param(sp.ab);
  const abValid = abParam !== undefined && isIsoDate(abParam);
  const listFrom = abValid ? abParam : today;

  const from = view === "monat" ? mondayOf(monthFirst) : listFrom;
  const to = view === "monat" ? addDays(mondayOf(monthLast), 6) : addDays(listFrom, LIST_DAYS - 1);

  const available = availableLayers(actor.role, actor.staffMemberId !== null, HIDDEN_MODULES);
  const [rows, deadlines, venues] = await Promise.all([
    listCalendarEvents(actor, { from, to }, layers),
    listCalendarDeadlines(actor, { from, to }, layers, today, HIDDEN_MODULES),
    listVenueOptions(actor),
  ]);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.typeKey] = (counts[r.typeKey] ?? 0) + 1;
  const visible = rows.filter((r) => layers.types.includes(r.typeKey));
  // Entries per module layer for the panel counts (everything fetched is already switched on and allowed).
  const deadlineCounts: Record<string, number> = {};
  for (const d of deadlines) deadlineCounts[d.layer] = (deadlineCounts[d.layer] ?? 0) + 1;

  // Same-day, same-kind items collapse into one summary ("70 Genehmigungen: Entscheidung erwartet");
  // single entries put the object first and the verb last.
  const display: DisplayItem[] = groupDeadlines(deadlines).map((item) => {
    const kind = item.group ? item.group.kind : deadlineKind(item);
    const kindLabel = kind ? t(`permitKind.${kind}`) : undefined;
    if (!item.group) return { ...item, text: deadlineText(item), kindLabel };
    const { count } = item.group;
    const text =
      item.layer === "tasks"
        ? t("group.tasks", { count })
        : kindLabel
          ? t("group.permits", { count, kind: kindLabel })
          : t("group.permitsAny", { count });
    return { ...item, text, kindLabel };
  });

  const allHolidays = holidaysBetween(from, to);
  const holidays = new Map(
    layers.holidays
      ? [...allHolidays].map(([d, h]) => [d, locale === "en" ? h.nameEn : h.nameDe] as const)
      : [],
  );
  // Every link to a market opens its Überblick (UX pass 2026-10-22).
  const eventHref = (id: string) => `/veranstaltungen/${id}`;

  // Navigation keeps the layer selection that is in the URL.
  const nav = (patch: Record<string, string | undefined>) => hrefWith(PATH, sp, patch);
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const prevHref =
    view === "monat" ? nav({ monat: prevMonth }) : nav({ ab: addDays(listFrom, -LIST_DAYS) });
  const nextHref =
    view === "monat" ? nav({ monat: nextMonth }) : nav({ ab: addDays(listFrom, LIST_DAYS) });
  const todayHref = nav({ monat: undefined, ab: undefined });
  // Switching the view keeps the browsed position: Liste → Monat shows the month the list starts in,
  // Monat → Liste starts the list on the 1st of the browsed month (today when that is this month).
  const monthHref = nav({
    ansicht: "monat",
    ab: undefined,
    monat: view === "liste" ? (abValid ? listFrom.slice(0, 7) : undefined) : monthParam,
  });
  const listHref = nav({
    ansicht: "liste",
    monat: undefined,
    ab: view === "monat" ? (month === today.slice(0, 7) ? undefined : monthFirst) : abParam,
  });
  // "+ N weitere" opens the list from that day.
  const moreHref = (day: string) => nav({ ansicht: "liste", monat: undefined, ab: day });
  const title =
    view === "monat"
      ? formatMonth(monthFirst, locale)
      : t("listTitle", { from: formatDate(from, locale), to: formatDate(to, locale) });

  const keep: Record<string, string> = {};
  if (explicitView) keep.ansicht = explicitView;
  if (view === "monat" && monthParam) keep.monat = month;
  if (view === "liste" && abValid) keep.ab = abParam;

  const holidayCount = allHolidays.size;
  const visibleCount = visible.length + deadlines.length + (layers.holidays ? holidayCount : 0);
  const changedCount = layersChangedCount(layers, available);

  // Weekend cap: Saturdays of weekends with 4+ events (cancelled ones don't count).
  const perWeekend = new Map<string, number>();
  for (const r of visible) {
    if (r.status === "cancelled") continue;
    for (const s of weekendsTouched(r.startsOn, r.endsOn))
      perWeekend.set(s, (perWeekend.get(s) ?? 0) + 1);
  }
  const flagged = new Set([...perWeekend].filter(([, n]) => n >= 4).map(([s]) => s));

  const entries = visible.flatMap((r) => {
    const out: { key: string; date: string; node: React.ReactNode }[] = [];
    const total = daysBetween(r.startsOn, r.endsOn) + 1;
    for (let d = r.startsOn; d <= r.endsOn; d = addDays(d, 1)) {
      if (d < from || d > to) continue;
      const index = daysBetween(r.startsOn, d) + 1;
      out.push({
        key: `${r.id}-${d}`,
        date: d,
        node: (
          <EventChip
            href={eventHref(r.id)}
            typeKey={r.typeKey}
            color={r.color}
            name={r.name}
            status={r.status}
            statusLabel={tStatus(r.status)}
            span={total > 1 ? { index, total } : undefined}
            spanLabel={total > 1 ? t("spanDay", { index, total }) : undefined}
          />
        ),
      });
    }
    return out;
  });

  for (const item of display) {
    entries.push({
      key: `${item.layer}-${item.id}`,
      date: item.date,
      node: (
        <DeadlineChip
          item={item}
          layerLabel={t(`layers.deadline.${item.layer}`)}
          toneLabel={
            item.tone === "warn" || item.tone === "critical" ? t(`tone.${item.tone}`) : undefined
          }
        />
      ),
    });
  }

  const pill =
    "inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover";

  const PlannedIcon = EVENT_STATUS.planned.icon;
  const ConfirmedIcon = EVENT_STATUS.confirmed.icon;

  const toolbar = (
    <>
      <nav aria-label={t("nav")} className="flex flex-wrap items-center gap-2">
        <Link href={prevHref as never} scroll={false} aria-label={t("prev")} className={pill}>
          ‹
        </Link>
        <Link href={todayHref as never} scroll={false} className={pill}>
          {t("today")}
        </Link>
        <Link href={nextHref as never} scroll={false} aria-label={t("next")} className={pill}>
          ›
        </Link>
        <MonthJump
          title={title}
          view={view}
          month={view === "monat" ? month : listFrom.slice(0, 7)}
          today={today}
          sp={sp}
        />
      </nav>
      <SegmentedLinks
        label={t("view")}
        items={[
          { key: "monat", label: t("views.monat"), href: monthHref, active: view === "monat" },
          { key: "liste", label: t("views.liste"), href: listHref, active: view === "liste" },
        ]}
      />
    </>
  );

  return (
    <Page crumbs={[{ label: tNav("calendar") }]} wide>
      <PageHeader title={tNav("calendar")} subtitle={t("subtitle")} />

      <LayerPanel
        toolbar={toolbar}
        defaultOpen={layersOpen}
        layers={layers}
        counts={counts}
        typeKeys={[...EVENT_TYPE_KEYS]}
        available={available}
        deadlineCounts={deadlineCounts}
        holidayCount={holidayCount}
        visibleCount={visibleCount}
        venues={venues}
        canMine={canMine}
        keep={keep}
        changedCount={changedCount}
      >
        <Panel className="overflow-hidden" aria-label={title}>
          {view === "monat" ? (
            <MonthGrid
              month={month}
              weekdays={tCal("weekdays").split(",")}
              weekLabel={tCal("week")}
              today={today}
              holidays={holidays}
              entries={entries}
              flaggedSaturdays={flagged}
              flagLabel={t("legend.weekend")}
              moreLabel={(n) => tCal("more", { n })}
              moreAria={(n, day) => t("moreAria", { n, day: formatDate(day, locale) })}
              moreHref={moreHref}
            />
          ) : (
            <CalendarList
              from={from}
              to={to}
              today={today}
              rows={visible}
              deadlines={display}
              holidays={holidays}
              hrefFor={eventHref}
              resetHref={hrefWith(PATH, {}, { ...layerParams(DEFAULT_LAYERS), ansicht: "liste" })}
            />
          )}
        </Panel>
        {view === "monat" && visible.length === 0 && deadlines.length === 0 && (
          <p className="m-0 flex flex-wrap items-center gap-x-3 text-muted-foreground text-small">
            {t("emptyMonth")}
            <Link
              href={
                hrefWith(PATH, {}, { ...layerParams(DEFAULT_LAYERS), monat: monthParam }) as never
              }
              className="font-medium text-accent-soft-foreground hover:underline"
            >
              {t("emptyReset")}
            </Link>
          </p>
        )}
        <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-tiny">
          {EVENT_TYPE_KEYS.filter((k) => layers.types.includes(k)).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <EventTypeSquare typeKey={k} className="size-2" />
              {t(`layers.types.${k}`)}
            </span>
          ))}
          {layers.deadlines
            .filter((l) => available.includes(l))
            .map((l) => {
              const Icon = LAYER_ICONS[l];
              return (
                <span key={l} className="inline-flex items-center gap-1">
                  <Icon aria-hidden className="size-3" />
                  {t(`layers.deadline.${l}`)}
                </span>
              );
            })}
          <span className="inline-flex items-center gap-1">
            <PlannedIcon aria-hidden className="size-3" />
            {tStatus("planned")}
          </span>
          <span className="inline-flex items-center gap-1">
            <ConfirmedIcon aria-hidden className="size-3" />
            {tStatus("confirmed")}
          </span>
          <span className="text-status-warn">{t("legend.weekend")}</span>
          {layers.holidays && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2.5 rounded-[2px] bg-status-critical-dot" />
              {t("legend.holiday")}
            </span>
          )}
          <span>{t("legend.cancelled")}</span>
        </p>
        <p className="m-0 text-right text-muted-foreground text-tiny touch:hidden">
          {t.rich("keys", { k: (chunks) => <Kbd>{chunks}</Kbd> })}
        </p>
      </LayerPanel>

      <KalenderShortcuts
        hrefs={{ t: todayHref, m: monthHref, l: listHref, prev: prevHref, next: nextHref }}
      />
      {!explicitView && (
        <ViewDefault assumedPhone={assumedPhone} known={phoneCookie !== undefined} />
      )}
    </Page>
  );
}
