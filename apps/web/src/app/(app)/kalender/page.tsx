import {
  addDays,
  daysInMonth,
  holidaysBetween,
  isIsoDate,
  isoDate,
  mondayOf,
  weekendsTouched,
} from "@marktwerk/core";
import { CalendarDays, List } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventChip } from "@/components/events/event-chip";
import { EventVorschau } from "@/components/events/event-vorschau";
import { MonthGrid } from "@/components/events/month-grid";
import { DeadlineChip, LAYER_ICONS } from "@/components/kalender/deadline-chip";
import { LayerPanel } from "@/components/kalender/layer-panel";
import {
  availableLayers,
  DEFAULT_LAYERS,
  layerParams,
  parseLayers,
} from "@/components/kalender/layers";
import { CalendarList } from "@/components/kalender/list-view";
import { KalenderShortcuts } from "@/components/kalender/shortcuts";
import { Page, PageHeader } from "@/components/shell/page";
import { EVENT_TYPE_KEYS, EventTypeSquare } from "@/components/ui/event-type-tag";
import { Kbd } from "@/components/ui/kbd";
import { Panel } from "@/components/ui/panel";
import { formatDate, formatMonth, todayIn } from "@/lib/format";
import { HIDDEN_MODULES } from "@/lib/modules";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  getSavedLayers,
  listCalendarDeadlines,
  listCalendarEvents,
  listVenueOptions,
} from "@/server/queries/kalender";
import { requirePermission } from "@/server/session";

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
  const locale = await getLocale();
  const today = todayIn();

  // Layers: explicit in the URL, else the person's saved selection, else everything on.
  const layers = parseLayers(sp) ?? (await getSavedLayers(actor.id)) ?? DEFAULT_LAYERS;
  const view = param(sp.ansicht) === "liste" ? "liste" : "monat";

  const monthParam = param(sp.monat);
  const month =
    monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const monthFirst = isoDate(y, m, 1);
  const monthLast = isoDate(y, m, daysInMonth(y, m));
  const abParam = param(sp.ab);
  const listFrom = abParam && isIsoDate(abParam) ? abParam : today;

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

  const allHolidays = holidaysBetween(from, to);
  const holidays = new Map(
    layers.holidays
      ? [...allHolidays].map(([d, h]) => [d, locale === "en" ? h.nameEn : h.nameDe] as const)
      : [],
  );
  const vorschauId = param(sp.vorschau);
  const peekHref = (id: string) => hrefWith(PATH, sp, { vorschau: id });
  const closeHref = hrefWith(PATH, sp, { vorschau: undefined });

  // Navigation keeps the layer selection that is in the URL.
  const nav = (patch: Record<string, string | undefined>) =>
    hrefWith(PATH, sp, { vorschau: undefined, ...patch });
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const prevHref =
    view === "monat" ? nav({ monat: prevMonth }) : nav({ ab: addDays(listFrom, -LIST_DAYS) });
  const nextHref =
    view === "monat" ? nav({ monat: nextMonth }) : nav({ ab: addDays(listFrom, LIST_DAYS) });
  const todayHref = nav({ monat: undefined, ab: undefined });
  const title =
    view === "monat"
      ? formatMonth(monthFirst, locale)
      : t("listTitle", { from: formatDate(from, locale), to: formatDate(to, locale) });

  const keep: Record<string, string> = {};
  if (view === "liste") keep.ansicht = "liste";
  if (view === "monat" && monthParam) keep.monat = month;
  if (view === "liste" && abParam && isIsoDate(abParam)) keep.ab = abParam;

  const holidayCount = allHolidays.size;
  const visibleCount = visible.length + deadlines.length + (layers.holidays ? holidayCount : 0);

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
    for (let d = r.startsOn; d <= r.endsOn; d = addDays(d, 1)) {
      if (d < from || d > to) continue;
      out.push({
        key: `${r.id}-${d}`,
        date: d,
        node: (
          <EventChip
            href={peekHref(r.id)}
            typeKey={r.typeKey}
            name={r.name}
            cancelled={r.status === "cancelled"}
          />
        ),
      });
    }
    return out;
  });

  for (const item of deadlines) {
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

  return (
    <Page crumbs={[{ label: tNav("calendar") }]} wide>
      <PageHeader title={tNav("calendar")} subtitle={t("subtitle")} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
          <h2 className="tabular ml-1 font-semibold text-[15px]">{title}</h2>
        </nav>
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls */}
        <div
          role="group"
          aria-label={t("view")}
          className="inline-flex gap-0.5 rounded-lg border border-input bg-sunken p-0.5"
        >
          {(["monat", "liste"] as const).map((v) => (
            <Link
              key={v}
              href={nav({ ansicht: v === "monat" ? undefined : v, ab: undefined }) as never}
              scroll={false}
              aria-current={view === v ? "true" : undefined}
              className="inline-flex min-h-7 items-center gap-1 rounded-md px-3 font-medium text-foreground-2 aria-[current=true]:bg-card aria-[current=true]:text-foreground aria-[current=true]:shadow-card"
            >
              {v === "monat" ? (
                <CalendarDays aria-hidden className="size-4" />
              ) : (
                <List aria-hidden className="size-4" />
              )}
              {t(`views.${v}`)}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <LayerPanel
          layers={layers}
          counts={counts}
          typeKeys={[...EVENT_TYPE_KEYS]}
          available={available}
          deadlineCounts={deadlineCounts}
          holidayCount={holidayCount}
          visibleCount={visibleCount}
          venues={venues}
          canMine={actor.staffMemberId !== null}
          keep={keep}
        />
        <div className="flex min-w-0 flex-col gap-3">
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
              />
            ) : (
              <CalendarList
                from={from}
                to={to}
                today={today}
                rows={visible}
                deadlines={deadlines}
                holidays={holidays}
                hrefFor={peekHref}
                vorschauId={vorschauId}
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
            <span className="text-status-warn">{t("legend.weekend")}</span>
            {layers.holidays && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="size-2.5 rounded-[2px] bg-status-critical-dot" />
                {t("legend.holiday")}
              </span>
            )}
            <span>{t("legend.cancelled")}</span>
          </p>
          <p className="m-0 text-right text-muted-foreground text-tiny">
            {t.rich("keys", { k: (chunks) => <Kbd>{chunks}</Kbd> })}
          </p>
        </div>
      </div>

      <KalenderShortcuts
        hrefs={{
          t: todayHref,
          m: nav({ ansicht: undefined, ab: undefined }),
          l: nav({ ansicht: "liste", monat: undefined }),
        }}
      />
      {vorschauId && <EventVorschau id={vorschauId} closeHref={closeHref} openTab="board" />}
    </Page>
  );
}
