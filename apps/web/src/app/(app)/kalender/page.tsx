import {
  addDays,
  CALENDAR_YEAR_MAX,
  CALENDAR_YEAR_MIN,
  can,
  daysBetween,
  daysInMonth,
  holidaysBetween,
  inCalendarRange,
  isoDate,
  MAX_EVENTS_PER_WEEKEND,
  mondayOf,
  monthWeeks,
  parseCalendarDay,
  parseCalendarMonth,
  parseCalendarYear,
  parseHiddenMarkets,
  SINGLE_EVENTS_KEY,
  shiftCalendarMonth,
  toggleHiddenMarket,
  weekday,
  weekendsTouched,
  yearDots,
  yearLegend,
  yearLegendKey,
} from "@marktwerk/core";
import { CalendarClock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppointmentChip } from "@/components/appointments/appointment-chip";
import {
  APPOINTMENT_PARAM,
  appointmentVorschauId,
  appointmentVorschauValue,
} from "@/components/appointments/appointment-params";
import { AppointmentVorschau } from "@/components/appointments/appointment-vorschau";
import { EventVorschau } from "@/components/events/event-vorschau";
import { DeadlineChip, LAYER_ICONS } from "@/components/kalender/deadline-chip";
import { EventChip } from "@/components/kalender/event-chip";
import { type EventPreview, eventVorschauId } from "@/components/kalender/event-params";
import { EventPopoverProvider } from "@/components/kalender/event-popover";
import {
  type DisplayItem,
  deadlineKind,
  deadlineShortText,
  deadlineText,
  groupDeadlines,
} from "@/components/kalender/group-deadlines";
import { LayerPanel, type MarketOption } from "@/components/kalender/layer-panel";
import {
  availableLayers,
  DEFAULT_LAYERS,
  KAL_PHONE_COOKIE,
  layerParams,
  layersChangedCount,
  parseLayers,
} from "@/components/kalender/layers";
import { CalendarList } from "@/components/kalender/list-view";
import { type CalendarEntry, MonthGrid } from "@/components/kalender/month-grid";
import { MonthJump } from "@/components/kalender/month-jump";
import { PrintButton } from "@/components/kalender/print-button";
import { KalenderShortcuts } from "@/components/kalender/shortcuts";
import { ViewDefault } from "@/components/kalender/view-default";
import { VorschauGone } from "@/components/kalender/vorschau-gone";
import { type YearDotView, YearGrid, type YearMonthView } from "@/components/kalender/year-grid";
import { YearLegend } from "@/components/kalender/year-legend";
import { Page, PageHeader } from "@/components/shell/page";
import { EVENT_TYPE_KEYS, EventTypeSquare } from "@/components/ui/event-type-tag";
import { Kbd } from "@/components/ui/kbd";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel } from "@/components/ui/panel";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import {
  formatDate,
  formatDateWithWeekday,
  formatMonth,
  formatMonthName,
  formatWeekdayDayMonth,
  todayIn,
} from "@/lib/format";
import { type CalendarHoliday, quietHoursValues } from "@/lib/holidays";
import { HIDDEN_MODULES, isModuleVisible } from "@/lib/modules";
import { EVENT_STATUS } from "@/lib/status";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/actor";
import { getAppointment, listAppointmentsBetween } from "@/server/queries/appointments";
import type { CalendarItem } from "@/server/queries/due";
import { getEvent } from "@/server/queries/events";
import {
  getSavedLayers,
  listCalendarDeadlines,
  listCalendarEvents,
  listVenueOptions,
} from "@/server/queries/kalender";
import { getCalendarYear, listLegendMarkets } from "@/server/queries/kalender-year";
import { getMarketShortCodes } from "@/server/queries/market-short-codes";
import { requirePermission } from "@/server/session";
import { getUiState } from "@/server/ui-state";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("calendar") };
}

const PATH = "/kalender";
const LIST_DAYS = 42;
/** A4 landscape on one page, light colours, the dots and tints printed (Jahresübersicht, Fahrplan R22). */
const YEAR_PRINT_CSS =
  "@media print{@page{size:A4 landscape;margin:8mm}html{color-scheme:light!important}body{background:#fff!important}}";

/** ‹ or ›; at the end of the range a dimmed placeholder instead of a link. */
function StepLink({
  href,
  label,
  className,
  children,
}: {
  href: string | undefined;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  if (!href)
    return (
      <span aria-hidden className={cn(className, "cursor-default opacity-40 hover:bg-card")}>
        {children}
      </span>
    );
  return (
    <Link href={href as never} scroll={false} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

export default async function KalenderPage({ searchParams }: PageProps<"/kalender">) {
  await requirePermission("event", "read");
  const actor = await getActor();
  // The event popover (`?vorschau=veranstaltung:<id>`) is the page's own state on the client: it is read
  // here once and kept out of every link the page builds (another month must not try to reopen it).
  const { vorschau: rawVorschau, ...rest } = await searchParams;
  const vorschauEvent = eventVorschauId(param(rawVorschau));
  const sp = vorschauEvent ? rest : { ...rest, vorschau: rawVorschau };
  const t = await getTranslations("kalenderPage");
  const tNav = await getTranslations("nav");
  const tCal = await getTranslations("calendar");
  const tAppt = await getTranslations("appointments");
  const tStatus = await getTranslations("status.event");
  const tTasks = await getTranslations("tasks");
  const tNotes = await getTranslations("holidayNotes");
  const locale = await getLocale();
  const today = todayIn();

  // Layers: explicit in the URL, else the person's saved selection, else everything on.
  const canMine = actor.staffMemberId !== null && isModuleVisible("team");
  const chosen = parseLayers(sp) ?? (await getSavedLayers(actor.id)) ?? DEFAULT_LAYERS;
  // "Nur meine Zuständigkeit" is not offered without Team: a saved selection must not narrow silently.
  const layers = canMine ? chosen : { ...chosen, mine: false };
  const vorschauAppointment = appointmentVorschauId(param(sp.vorschau));
  const layersOpen = await getUiState("calendarLayers");

  // View: an explicit `?ansicht=` always wins. Without one phones (below md) open in Liste and wider
  // screens in Monat (decision 2026-10-28); the width comes from a cookie that `ViewDefault` keeps in
  // step, so only the view that is shown gets fetched.
  const ansicht = param(sp.ansicht);
  const explicitView =
    ansicht === "liste" || ansicht === "monat" || ansicht === "jahr" ? ansicht : undefined;
  const phoneCookie = (await cookies()).get(KAL_PHONE_COOKIE)?.value;
  const assumedPhone = phoneCookie === "1";
  const view = explicitView ?? (assumedPhone ? "liste" : "monat");

  // `monat`, `ab` and `jahr` stay within CALENDAR_YEAR_MIN–MAX (UX-041: `?monat=9999-12` used to fail in the
  // database): a year outside is pulled to the nearest end and the page says so; a malformed value shows today.
  const monthParsed = parseCalendarMonth(param(sp.monat));
  const monthParam = monthParsed?.month;
  const month = monthParsed?.month ?? today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const monthFirst = isoDate(y, m, 1);
  const monthLast = isoDate(y, m, daysInMonth(y, m));
  const abParsed = parseCalendarDay(param(sp.ab));
  const abParam = abParsed?.date;
  const abValid = abParam !== undefined;
  const listFrom = abParam ?? today;
  // Jahr (Jahresübersicht, Fahrplan R22): `jahr` is the year. `ohne` holds the markets switched off, in the
  // Jahr legend and in the Ebenen panel of Monat and Liste alike (one filter for all three views, UX-051).
  const thisYear = Number(today.slice(0, 4));
  const yearParsed = parseCalendarYear(param(sp.jahr));
  const jahrValid = yearParsed !== null;
  const year = yearParsed?.year ?? thisYear;
  const clamped =
    view === "monat"
      ? monthParsed?.clamped
      : view === "jahr"
        ? yearParsed?.clamped
        : abParsed?.clamped;
  const hiddenMarkets = parseHiddenMarkets(sp.ohne);

  const from =
    view === "monat" ? mondayOf(monthFirst) : view === "jahr" ? isoDate(year, 1, 1) : listFrom;
  const to =
    view === "monat"
      ? addDays(mondayOf(monthLast), 6)
      : view === "jahr"
        ? isoDate(year, 12, 31)
        : addDays(listFrom, LIST_DAYS - 1);

  const available = availableLayers(actor.role, actor.staffMemberId !== null, HIDDEN_MODULES);
  // Besprechungen: "Nur Achtung und Kritisch" hides them (they have no urgency), "Nur meine Zuständigkeit" does not
  // touch them; the Ort narrowing keeps those at that venue.
  // The Jahr view shows markets and holidays only: no deadlines, no Besprechungen.
  const isYear = view === "jahr";
  // Every layer the person may see is loaded, also the ones switched off, so each counter in the Ebenen
  // panel says how many entries the layer has whether or not it is on (UX-051: an off layer read "0").
  const appointmentsAllowed = !isYear && available.includes("appointments") && !layers.critical;
  const showAppointments = appointmentsAllowed && layers.deadlines.includes("appointments");
  const [eventRows, allDeadlines, venues, allAppointments, shortCodes, yearData, markets] =
    await Promise.all([
      isYear ? Promise.resolve([]) : listCalendarEvents(actor, { from, to }, layers),
      isYear
        ? Promise.resolve([])
        : listCalendarDeadlines(
            actor,
            { from, to },
            { ...layers, deadlines: available },
            today,
            HIDDEN_MODULES,
          ),
      listVenueOptions(actor),
      appointmentsAllowed ? listAppointmentsBetween(from, to) : Promise.resolve([]),
      getMarketShortCodes(),
      isYear ? getCalendarYear(actor, year, layers) : Promise.resolve(null),
      isYear ? Promise.resolve([]) : listLegendMarkets(),
    ]);
  const rows = yearData?.rows ?? eventRows;
  const venueAppointments = layers.venue
    ? allAppointments.filter((a) => a.venueId === layers.venue)
    : allAppointments;
  const appointments = showAppointments ? venueAppointments : [];
  const deadlines = allDeadlines.filter((d) => layers.deadlines.includes(d.layer));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.typeKey] = (counts[r.typeKey] ?? 0) + 1;
  const visible = rows.filter((r) => layers.types.includes(r.typeKey));
  // Monat and Liste leave the switched-off markets out here; the Jahr view hides their dots further down.
  const shown = isYear ? visible : visible.filter((r) => !hiddenMarkets.includes(yearLegendKey(r)));
  const deadlineCounts: Record<string, number> = {};
  for (const d of allDeadlines) deadlineCounts[d.layer] = (deadlineCounts[d.layer] ?? 0) + 1;
  if (venueAppointments.length > 0) deadlineCounts.appointments = venueAppointments.length;

  // The markets of the shown range for the Ebenen panel (Monat, Liste): those with dates of the shown types,
  // plus every switched-off one, so it can be switched on again. Same names and order as the Jahr legend.
  const marketName = (key: string, name: string) =>
    key === SINGLE_EVENTS_KEY ? t("year.singleEvents") : name;
  const marketCounts = new Map<string, number>();
  for (const r of visible)
    marketCounts.set(yearLegendKey(r), (marketCounts.get(yearLegendKey(r)) ?? 0) + 1);
  const offMarkets: MarketOption[] = [];
  for (const key of hiddenMarkets) {
    if (marketCounts.has(key)) continue;
    const market = markets.find((mk) => mk.id === key);
    if (!market && key !== SINGLE_EVENTS_KEY) continue;
    offMarkets.push({
      key,
      name: marketName(key, market?.name ?? ""),
      code: market ? (shortCodes.get(key) ?? null) : null,
      color: market?.color ?? null,
      typeKey: market?.typeKey ?? null,
      count: 0,
      hidden: true,
    });
  }
  const marketOptions: MarketOption[] = isYear
    ? []
    : [
        ...yearLegend(markets, visible, { includeEmpty: false }).map((entry) => ({
          key: entry.key,
          name: marketName(entry.key, entry.name),
          code: entry.key === SINGLE_EVENTS_KEY ? null : (shortCodes.get(entry.key) ?? null),
          color: entry.market?.color ?? entry.sample?.color ?? null,
          typeKey: entry.market?.typeKey ?? entry.sample?.typeKey ?? null,
          count: marketCounts.get(entry.key) ?? 0,
          hidden: hiddenMarkets.includes(entry.key),
        })),
        ...offMarkets,
      ];

  // Same-day, same-kind items collapse into one summary ("70 Genehmigungen: Entscheidung erwartet");
  // single entries put the object first and the verb last. A season task names its market and season after
  // the title ("Termine planen · Flohmarkt Bilk · Saison 2027", research 13 §6.3).
  const seasonLabel = (i: CalendarItem) =>
    i.season
      ? tTasks("seasonContext", { name: i.season.name, year: String(i.season.year) })
      : undefined;
  const display: DisplayItem[] = groupDeadlines(deadlines).map((item) => {
    const kind = item.group ? item.group.kind : deadlineKind(item);
    const kindLabel = kind ? t(`permitKind.${kind}`) : undefined;
    if (!item.group)
      return {
        ...item,
        text: deadlineText(item),
        shortText: deadlineShortText(item),
        kindLabel: kindLabel ?? seasonLabel(item),
      };
    const { count } = item.group;
    const text =
      item.layer === "tasks"
        ? t("group.tasks", { count })
        : kindLabel
          ? t("group.permits", { count, kind: kindLabel })
          : t("group.permitsAny", { count });
    const members = item.group.members.map((m) => ({
      key: m.id,
      href: m.href,
      text: [deadlineText(m), seasonLabel(m)].filter(Boolean).join(" · "),
    }));
    return { ...item, text, kindLabel, members };
  });
  const groupLabels = (item: DisplayItem) => ({
    aria: t("groupAria", { text: item.text }),
    allLabel: item.layer === "tasks" ? t("groupAllTasks") : t("groupAll"),
  });

  // Holidays plus the stille Tage that are no holiday (Volkstrauertag, Totensonntag, Heiligabend): their names
  // show in the day cell, the stille Feiertage with a warning (markets mostly not allowed, FeiertG NW §6).
  const allHolidays = holidaysBetween(from, to, "NW", { observances: true });
  const holidays = new Map<string, CalendarHoliday>(
    layers.holidays
      ? [...allHolidays].map(([d, h]) => [
          d,
          {
            name: locale === "en" ? h.nameEn : h.nameDe,
            dayOff: !h.observance,
            quiet: h.quiet ? tNotes("quiet", quietHoursValues(h.quiet)) : null,
          },
        ])
      : [],
  );
  const anyQuiet = [...holidays.values()].some((h) => h.quiet);
  // Every link to a market opens its Überblick (UX pass 2026-10-22); a plain click on a chip or row opens
  // the event popover first (UT2-08). Its data comes from the rows already loaded (no query per event).
  const eventHref = (id: string) => `/veranstaltungen/${id}`;
  const previews: EventPreview[] = visible.map((r) => ({
    id: r.id,
    name: r.name,
    typeKey: r.typeKey,
    typeName: locale === "en" ? r.typeNameEn : r.typeNameDe,
    status: r.status,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    venueName: r.venueName,
    schedule: r.schedule,
    tasks: r.taskCounts,
  }));
  // A `vorschau` link to something that is gone (deleted, archived, mistyped) says so instead of showing
  // nothing (UX-072). An event outside the loaded range still opens its Vorschau.
  const eventGone =
    vorschauEvent !== null &&
    !previews.some((p) => p.id === vorschauEvent) &&
    (await getEvent(actor, vorschauEvent)) === null;
  const appointmentGone =
    vorschauAppointment !== null &&
    can(actor.role, "appointment", "read") &&
    (await getAppointment(vorschauAppointment)) === null;

  // Navigation keeps the layer selection that is in the URL.
  // ‹ and › stop at the ends of the range: no link beyond CALENDAR_YEAR_MIN–MAX.
  const nav = (patch: Record<string, string | undefined>) => hrefWith(PATH, sp, patch);
  const step = (by: -1 | 1): string | undefined => {
    if (view === "monat") {
      const target = shiftCalendarMonth(month, by);
      return target ? nav({ monat: target }) : undefined;
    }
    if (view === "jahr")
      return inCalendarRange(year + by) ? nav({ jahr: String(year + by) }) : undefined;
    const target = addDays(listFrom, by * LIST_DAYS);
    return inCalendarRange(Number(target.slice(0, 4))) ? nav({ ab: target }) : undefined;
  };
  const prevHref = step(-1);
  const nextHref = step(1);
  const todayHref = nav({ monat: undefined, ab: undefined, jahr: undefined });
  // Switching the view keeps the browsed position: Liste → Monat shows the month the list starts in,
  // Monat → Liste starts the list on the 1st of the browsed month (today when that is this month);
  // Jahr → Monat/Liste opens January of the browsed year (this month/today in the current year), and
  // Monat/Liste → Jahr the year being browsed. The market filter (`ohne`) goes along to every view.
  const leaveYear = { jahr: undefined };
  const yearStart = year === thisYear ? undefined : isoDate(year, 1, 1);
  const monthHref = nav({
    ansicht: "monat",
    ab: undefined,
    ...leaveYear,
    monat:
      view === "liste"
        ? abValid
          ? listFrom.slice(0, 7)
          : undefined
        : view === "jahr"
          ? yearStart?.slice(0, 7)
          : monthParam,
  });
  const listHref = nav({
    ansicht: "liste",
    monat: undefined,
    ...leaveYear,
    ab:
      view === "monat"
        ? month === today.slice(0, 7)
          ? undefined
          : monthFirst
        : view === "jahr"
          ? yearStart
          : abParam,
  });
  const browsedYear = view === "monat" ? y : view === "liste" ? Number(listFrom.slice(0, 4)) : year;
  const yearHref = nav({
    ansicht: "jahr",
    monat: undefined,
    ab: undefined,
    jahr: browsedYear === thisYear ? undefined : String(browsedYear),
  });
  // "+ N weitere" opens the list from that day.
  const moreHref = (day: string) => nav({ ansicht: "liste", monat: undefined, ab: day });
  const title =
    view === "monat"
      ? formatMonth(monthFirst, locale)
      : view === "jahr"
        ? String(year)
        : t("listTitle", { from: formatDate(from, locale), to: formatDate(to, locale) });

  const keep: Record<string, string> = {};
  if (explicitView) keep.ansicht = explicitView;
  if (view === "monat" && monthParam) keep.monat = month;
  if (view === "liste" && abValid) keep.ab = abParam;
  if (view === "jahr" && jahrValid) keep.jahr = String(year);
  if (hiddenMarkets.length > 0) keep.ohne = hiddenMarkets.join(",");

  const holidayCount = allHolidays.size;
  const visibleCount =
    shown.length + appointments.length + deadlines.length + (layers.holidays ? holidayCount : 0);
  // The Jahr view offers the event layers only, so only those count as changed there; its legend has its
  // own "Alle zeigen". In Monat and Liste the switched-off markets count as one change.
  const marketsChanged = !isYear && hiddenMarkets.length > 0;
  const changedCount =
    layersChangedCount(layers, isYear ? [] : available) + (marketsChanged ? 1 : 0);
  // What differs from the default, in words, for the "geändert" chip (UX-072: it did not say what is hidden).
  const moduleLayers = isYear ? [] : available;
  const changedOff = [
    ...EVENT_TYPE_KEYS.filter((k) => !layers.types.includes(k)).map((k) => t(`layers.types.${k}`)),
    ...moduleLayers
      .filter((l) => DEFAULT_LAYERS.deadlines.includes(l) && !layers.deadlines.includes(l))
      .map((l) => t(`layers.deadline.${l}`)),
    ...(DEFAULT_LAYERS.holidays && !layers.holidays ? [t("layers.holidays")] : []),
  ];
  const changedOn = moduleLayers
    .filter((l) => !DEFAULT_LAYERS.deadlines.includes(l) && layers.deadlines.includes(l))
    .map((l) => t(`layers.deadline.${l}`));
  const changedNarrow = [
    ...(layers.critical ? [t("layers.critical")] : []),
    ...(layers.mine ? [t("layers.mine")] : []),
    ...(layers.venue ? [venues.find((v) => v.id === layers.venue)?.name ?? t("layers.venue")] : []),
  ];
  const changedSummary = [
    changedOff.length > 0 ? t("layers.changedOff", { names: changedOff.join(", ") }) : null,
    changedOn.length > 0 ? t("layers.changedOn", { names: changedOn.join(", ") }) : null,
    changedNarrow.length > 0
      ? t("layers.changedNarrow", { names: changedNarrow.join(", ") })
      : null,
    marketsChanged ? t("year.hiddenCount", { count: hiddenMarkets.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Weekend cap: Saturdays of weekends with 4+ events (cancelled ones don't count).
  const perWeekend = new Map<string, number>();
  for (const r of shown) {
    if (r.status === "cancelled") continue;
    for (const s of weekendsTouched(r.startsOn, r.endsOn))
      perWeekend.set(s, (perWeekend.get(s) ?? 0) + 1);
  }
  const flagged = new Set(
    [...perWeekend].filter(([, n]) => n >= MAX_EVENTS_PER_WEEKEND).map(([s]) => s),
  );

  // Multi-day events first (by start), so each keeps the same slot on all its days and reads as one bar
  // (UT-11 #1); the name shows on its first day and again on Mondays, the other days continue the bar.
  const multiDay = (r: (typeof visible)[number]) => (r.endsOn > r.startsOn ? 0 : 1);
  const ordered = [...shown].sort(
    (a, b) =>
      multiDay(a) - multiDay(b) || a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id),
  );
  const entries = ordered.flatMap((r) => {
    const out: CalendarEntry[] = [];
    const marker = (
      <MarketMarker
        key={`${r.id}-marker`}
        color={r.color}
        typeKey={r.typeKey}
        shape="dot"
        className={cn("size-2", r.status === "cancelled" && "opacity-40")}
      />
    );
    const total = daysBetween(r.startsOn, r.endsOn) + 1;
    for (let d = r.startsOn; d <= r.endsOn; d = addDays(d, 1)) {
      if (d < from || d > to) continue;
      const index = daysBetween(r.startsOn, d) + 1;
      const continuation = index > 1 && weekday(d) !== 1;
      out.push({
        key: `${r.id}-${d}`,
        date: d,
        node: (
          <EventChip
            eventId={r.id}
            href={eventHref(r.id)}
            typeKey={r.typeKey}
            color={r.color}
            shortCode={r.presetId ? shortCodes.get(r.presetId) : undefined}
            name={r.name}
            status={r.status}
            statusLabel={tStatus(r.status)}
            span={total > 1 ? { index, total } : undefined}
            spanLabel={total > 1 ? t("spanDay", { index, total }) : undefined}
            continuation={continuation}
          />
        ),
        marker,
      });
    }
    return out;
  });

  // Besprechungen come before the deadlines of their day (all-day first, then by time: the query's order).
  // "Besprechung anlegen" per day opens the dialog with that date; closing/editing links of a Vorschau are dropped.
  const canCreateAppointment = can(actor.role, "appointment", "write");
  const addHref = (day: string) =>
    hrefWith(PATH, sp, {
      neu: APPOINTMENT_PARAM,
      datum: day,
      vorschau: undefined,
      bearbeiten: undefined,
    });
  const addLabel = (day: string) =>
    t("addAppointment", { date: formatDateWithWeekday(day, locale) });
  const appointmentLink = (id: string) =>
    hrefWith(PATH, sp, { vorschau: appointmentVorschauValue(id) });
  for (const a of appointments) {
    entries.push({
      key: `appointment-${a.id}`,
      date: a.onDate,
      node: (
        <AppointmentChip
          href={appointmentLink(a.id)}
          title={a.title}
          startsAt={a.startsAt}
          allDayLabel={tAppt("chip.allDay")}
          kindLabel={tAppt("chip.kind")}
        />
      ),
      marker: <CalendarClock aria-hidden className="size-2.5 text-foreground-2" />,
    });
  }

  for (const item of display) {
    const MarkerIcon = LAYER_ICONS[item.layer];
    entries.push({
      marker: (
        <MarkerIcon
          aria-hidden
          className={cn(
            "size-2.5",
            item.tone === "critical"
              ? "text-status-critical"
              : item.tone === "warn"
                ? "text-status-warn"
                : "text-foreground-2",
          )}
        />
      ),
      key: `${item.layer}-${item.id}`,
      date: item.date,
      node: (
        <DeadlineChip
          item={item}
          group={item.members ? groupLabels(item) : undefined}
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
        <StepLink href={prevHref} label={t("prev")} className={pill}>
          ‹
        </StepLink>
        <Link href={todayHref as never} scroll={false} className={pill}>
          {t("today")}
        </Link>
        <StepLink href={nextHref} label={t("next")} className={pill}>
          ›
        </StepLink>
        {view === "jahr" ? (
          <h2 className="tabular m-0 ml-1 px-2 font-semibold text-[15px]">{title}</h2>
        ) : (
          <MonthJump
            title={title}
            view={view}
            month={view === "monat" ? month : listFrom.slice(0, 7)}
            today={today}
            sp={sp}
          />
        )}
      </nav>
      <SegmentedLinks
        label={t("view")}
        items={[
          { key: "monat", label: t("views.monat"), href: monthHref, active: view === "monat" },
          { key: "liste", label: t("views.liste"), href: listHref, active: view === "liste" },
          { key: "jahr", label: t("views.jahr"), href: yearHref, active: view === "jahr" },
        ]}
      />
      {view === "jahr" && <PrintButton label={t("year.print")} />}
    </>
  );

  // Jahresübersicht: twelve month grids with a dot per market date; the legend lists the markets and
  // switches them off (`ohne`). Dot names say market, Kürzel and day ("Altstadt (ALT), Sa 6. März").
  let yearView: React.ReactNode = null;
  if (yearData) {
    const shownEvents = visible.filter((r) => !hiddenMarkets.includes(yearLegendKey(r)));
    const dots = new Map<string, YearDotView[]>();
    for (const [day, list] of yearDots(shownEvents, year)) {
      const holiday = holidays.get(day);
      const date = formatWeekdayDayMonth(day, locale);
      dots.set(
        day,
        list.map(({ event: r, index, total }) => {
          const code = r.presetId ? shortCodes.get(r.presetId) : undefined;
          const cancelled = r.status === "cancelled";
          const label = [
            code
              ? t("year.dot", { name: r.name, code, date })
              : t("year.dotNoCode", { name: r.name, date }),
            total > 1 ? t("spanDay", { index, total }) : null,
            cancelled ? tStatus("cancelled") : null,
            holiday?.name ?? null,
          ]
            .filter(Boolean)
            .join(", ");
          return {
            key: `${r.id}-${day}`,
            eventId: r.id,
            href: eventHref(r.id),
            code,
            color: r.color,
            typeKey: r.typeKey,
            cancelled,
            label,
          };
        }),
      );
    }
    const months: YearMonthView[] = Array.from({ length: 12 }, (_, i) => {
      const first = isoDate(year, i + 1, 1);
      return {
        key: first.slice(0, 7),
        title: formatMonthName(first, locale),
        href: nav({ ansicht: "monat", monat: first.slice(0, 7), ab: undefined, ...leaveYear }),
        hrefLabel: t("year.openMonth", { month: formatMonth(first, locale) }),
        weeks: monthWeeks(year, i + 1),
      };
    });
    const legendItems = yearData.legend.map((entry) => {
      const name = entry.key === SINGLE_EVENTS_KEY ? t("year.singleEvents") : entry.name;
      const countLabel = t("year.count", { count: entry.count });
      return {
        key: entry.key,
        name,
        code: entry.code,
        color: entry.color,
        typeKey: entry.typeKey,
        countLabel,
        label: entry.code
          ? t("year.legendItem", { name, code: entry.code, count: countLabel })
          : t("year.legendItemNoCode", { name, count: countLabel }),
        hidden: hiddenMarkets.includes(entry.key),
        href: nav({ ohne: toggleHiddenMarket(hiddenMarkets, entry.key) }),
      };
    });
    const yearTitle = t("year.title", { year });
    yearView = (
      <div className="flex flex-col gap-4 [print-color-adjust:exact] print:gap-[2mm]">
        <style>{YEAR_PRINT_CSS}</style>
        <div className="hidden items-baseline gap-x-4 print:flex">
          <h2 className="m-0 font-semibold text-[11pt]">{yearTitle}</h2>
          {hiddenMarkets.length > 0 && (
            <span className="text-[7pt] text-muted-foreground">
              {t("year.hiddenCount", { count: hiddenMarkets.length })}
            </span>
          )}
          <span className="ml-auto text-[7pt] text-muted-foreground">
            {t("year.asOf", { date: formatDate(today, locale) })}
          </span>
        </div>
        <section aria-label={yearTitle}>
          <YearGrid
            months={months}
            weekdays={tCal("weekdays").split(",")}
            weekLabel={tCal("week")}
            today={today}
            holidays={holidays}
            dots={dots}
          />
        </section>
        {shown.length === 0 && (
          <p className="m-0 flex flex-wrap items-center gap-x-3 text-muted-foreground text-small print:hidden">
            {t("year.empty")}
            <Link
              href={
                hrefWith(
                  PATH,
                  {},
                  { ...layerParams(DEFAULT_LAYERS), ansicht: "jahr", jahr: keep.jahr },
                ) as never
              }
              className="font-medium text-accent-soft-foreground hover:underline"
            >
              {t("emptyReset")}
            </Link>
          </p>
        )}
        <YearLegend
          title={t("year.legendTitle")}
          hint={t("year.legendHint")}
          items={legendItems}
          showAllHref={hiddenMarkets.length > 0 ? nav({ ohne: undefined }) : undefined}
          showAllLabel={t("year.showAll")}
        />
        <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-tiny print:text-[6pt]">
          {layers.holidays && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2.5 rounded-[2px] bg-status-critical-dot" />
              {t("legend.holiday")}
            </span>
          )}
          {anyQuiet && (
            <span className="inline-flex items-center gap-1 text-status-warn">
              <TriangleAlert aria-hidden className="size-3" />
              {tNotes("legendQuiet")}
            </span>
          )}
          <span>{t("legend.cancelled")}</span>
        </p>
      </div>
    );
  }

  return (
    <Page crumbs={[{ label: tNav("calendar") }]} wide className="print:gap-0 print:p-0!">
      {/* Printing (the Jahresübersicht replaces the paper wall calendar) leaves the page chrome out. */}
      <div className="print:hidden">
        <PageHeader title={tNav("calendar")} subtitle={t("subtitle")} />
      </div>

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
        changedSummary={changedSummary}
        markets={marketOptions}
        eventsOnly={isYear}
      >
        {clamped && (
          <p
            role="status"
            className="m-0 flex items-center gap-2 rounded-lg bg-status-warn-bg px-3 py-2 text-small text-status-warn"
          >
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {t("rangeClamped", { min: CALENDAR_YEAR_MIN, max: CALENDAR_YEAR_MAX })}
          </p>
        )}
        <EventPopoverProvider
          path={PATH}
          events={previews}
          vorschauId={vorschauEvent}
          canWrite={can(actor.role, "event", "write")}
          canTasks={can(actor.role, "task", "read")}
          fallback={
            vorschauEvent ? (
              eventGone ? (
                <VorschauGone
                  kind={t("gone.event")}
                  closeHref={hrefWith(PATH, sp, { vorschau: undefined })}
                />
              ) : (
                <EventVorschau
                  id={vorschauEvent}
                  closeHref={hrefWith(PATH, sp, { vorschau: undefined })}
                />
              )
            ) : null
          }
        >
          {yearView ?? (
            <Panel className="overflow-hidden" aria-label={title}>
              {view === "monat" ? (
                <MonthGrid
                  month={month}
                  weekdays={tCal("weekdays").split(",")}
                  weekLabel={tCal("week")}
                  today={today}
                  todayLabel={t("todayMarker")}
                  holidays={holidays}
                  entries={entries}
                  flaggedSaturdays={flagged}
                  flagLabel={t("legend.weekend")}
                  moreLabel={(n) => tCal("more", { n })}
                  moreAria={(n, day) => t("moreAria", { n, day: formatDate(day, locale) })}
                  dayTitle={(day) => formatDateWithWeekday(day, locale)}
                  dayAria={(n, day) => t("dayAria", { n, day: formatDateWithWeekday(day, locale) })}
                  moreHref={moreHref}
                  moreListLabel={t("moreList")}
                  addHref={canCreateAppointment ? addHref : undefined}
                  addLabel={addLabel}
                  addText={t("addAppointmentShort")}
                  emptyDayLabel={t("emptyDay")}
                />
              ) : (
                <CalendarList
                  from={from}
                  to={to}
                  today={today}
                  rows={shown}
                  deadlines={display}
                  appointments={appointments}
                  appointmentHref={appointmentLink}
                  holidays={holidays}
                  hrefFor={eventHref}
                  resetHref={hrefWith(
                    PATH,
                    {},
                    { ...layerParams(DEFAULT_LAYERS), ansicht: "liste" },
                  )}
                  addHref={canCreateAppointment ? addHref : undefined}
                  addLabel={addLabel}
                />
              )}
            </Panel>
          )}
        </EventPopoverProvider>
        {view === "monat" &&
          shown.length === 0 &&
          deadlines.length === 0 &&
          appointments.length === 0 && (
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
        {!isYear && (
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-tiny">
            {EVENT_TYPE_KEYS.filter((k) => layers.types.includes(k)).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <EventTypeSquare typeKey={k} className="size-2" />
                {t(`layers.types.${k}`)}
              </span>
            ))}
            {layers.deadlines
              .filter((l) => available.includes(l))
              .filter((l) => l !== "appointments" || showAppointments)
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
            {anyQuiet && (
              <span className="inline-flex items-center gap-1 text-status-warn">
                <TriangleAlert aria-hidden className="size-3" />
                {tNotes("legendQuiet")}
              </span>
            )}
            <span>{t("legend.cancelled")}</span>
          </p>
        )}
        <p className="m-0 text-right text-muted-foreground text-tiny touch:hidden print:hidden">
          {t.rich("keys", { k: (chunks) => <Kbd>{chunks}</Kbd> })}
          {view === "monat" && (
            <>
              {" · "}
              {t.rich(canCreateAppointment ? "gridKeysAdd" : "gridKeys", {
                k: (chunks) => <Kbd>{chunks}</Kbd>,
              })}
            </>
          )}
        </p>
      </LayerPanel>

      {vorschauAppointment && appointmentGone && (
        <VorschauGone
          kind={tAppt("vorschau.kind")}
          closeHref={hrefWith(PATH, sp, { vorschau: undefined })}
        />
      )}
      {vorschauAppointment && !appointmentGone && (
        <AppointmentVorschau
          id={vorschauAppointment}
          closeHref={hrefWith(PATH, sp, { vorschau: undefined })}
          editHref={hrefWith(PATH, sp, {
            vorschau: undefined,
            neu: APPOINTMENT_PARAM,
            bearbeiten: vorschauAppointment,
          })}
          reopenHref={hrefWith(PATH, sp, {
            vorschau: appointmentVorschauValue(vorschauAppointment),
          })}
        />
      )}

      <KalenderShortcuts
        hrefs={{ t: todayHref, m: monthHref, l: listHref, prev: prevHref, next: nextHref }}
      />
      {!explicitView && (
        <ViewDefault assumedPhone={assumedPhone} known={phoneCookie !== undefined} />
      )}
    </Page>
  );
}
