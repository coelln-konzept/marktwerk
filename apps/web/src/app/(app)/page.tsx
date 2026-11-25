import { can } from "@marktwerk/core";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  APPOINTMENT_PARAM,
  appointmentVorschauId,
  appointmentVorschauValue,
} from "@/components/appointments/appointment-params";
import { AppointmentVorschau } from "@/components/appointments/appointment-vorschau";
import { NewTaskButton } from "@/components/board/new-task-dialog";
import { EventVorschau } from "@/components/events/event-vorschau";
import { PastMarketsDrawer, PastMarketsLine } from "@/components/overview/past-markets";
import { TodayCard, UpcomingPermitsCard } from "@/components/overview/today-card";
import { WeekendCard } from "@/components/overview/weekend-card";
import { Page, PageHeader } from "@/components/shell/page";
import { TaskDrawer } from "@/components/task/task-drawer";
import { Drawer } from "@/components/ui/drawer";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { formatDate, formatWeek, todayIn } from "@/lib/format";
import { HIDDEN_MODULES, isModuleHidden } from "@/lib/modules";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { listAppointmentsOn } from "@/server/queries/appointments";
import { getOverview } from "@/server/queries/overview";
import {
  getNotifySelf,
  getTaskDetail,
  listStaffOptions,
  listTaskEventOptions,
} from "@/server/queries/tasks";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("overview") };
}

/** Hour of day in the company's time zone. */
function berlinHour(timeZone = "Europe/Berlin"): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date())
    .find((p) => p.type === "hour")?.value;
  return Number(hour ?? 12);
}

/**
 * The Übersicht (decision 2026-11-13): the main panel "Heute & nächste Tage" (Überfällig · Heute · Nächste
 * Tage, per market) on the left, the weekend box (the weekend's events with their Checkliste progress) top
 * right, the permits coming up at the bottom. A task opens its drawer here (`?aufgabe=<id>`, like on the
 * board), a market its Vorschau (`?vorschau=<id>`).
 */
export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("overview");
  const tNav = await getTranslations("nav");
  const tBoard = await getTranslations("board");
  const locale = await getLocale();
  const today = todayIn();
  const hour = berlinHour();
  // "Guten Abend" from 18:00 Berlin time (UX-064: it read as too early at 17:00).
  const part = hour < 11 ? "morning" : hour < 18 ? "day" : "evening";
  const weekday = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${today}T12:00:00Z`));
  const [overview, appointments] = await Promise.all([
    getOverview(actor, today, HIDDEN_MODULES),
    can(actor.role, "appointment", "read") ? listAppointmentsOn(today) : Promise.resolve([]),
  ]);
  const vorschauParam = param(sp.vorschau);
  const appointmentId = appointmentVorschauId(vorschauParam);
  const vorschauId = appointmentId ? undefined : vorschauParam;
  const taskId = param(sp.aufgabe);
  const canWrite = can(actor.role, "task", "write");
  // A market running today comes first on phones, with Heute (UX-006); from 1024 px it stays top right.
  const marketToday = overview.weekend.markets.some(
    (m) => m.row.startsOn <= today && m.row.endsOn >= today,
  );

  // The task drawer, as on the board; Esc or × returns to the row it was opened from.
  const closeHref = hrefWith("/", sp, { aufgabe: undefined });
  const canReadTasks = can(actor.role, "task", "read");
  const [staff, detail] =
    taskId && canReadTasks
      ? await Promise.all([listStaffOptions(), getTaskDetail(actor, taskId, today)])
      : [[], null];
  const taskDrawer = taskId ? (
    detail ? (
      <TaskDrawer
        task={detail}
        staff={staff}
        canWrite={canWrite}
        canAssign={!isModuleHidden("team") && can(actor.role, "task", "assign")}
        canDelete={can(actor.role, "task", "delete")}
        today={today}
        closeHref={closeHref}
      />
    ) : (
      <Drawer kind={tBoard("drawer.label")} title={tBoard("drawer.notFound")} closeHref={closeHref}>
        <p className="text-muted-foreground text-small">{tBoard("drawer.notFoundHint")}</p>
      </Drawer>
    )
  ) : null;

  return (
    <Page crumbs={[{ label: tNav("overview") }]}>
      <PageHeader
        eyebrow={
          <span className="tabular">
            {weekday}, {formatDate(today, locale)} · {formatWeek(today, locale)}
          </span>
        }
        title={t(`greeting.${part}`, { name: actor.firstName })}
      />
      {/* One KeyboardRows around all sections: J/K walk the main panel, then the weekend box, then the
          permits. Phones stack them in that order (a market running today moves its box to the top); from
          1024 px the weekend box sits top right. */}
      <KeyboardRows className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <TodayCard
          due={overview.due}
          otherTasks={overview.otherTasks}
          appointments={appointments}
          today={today}
          canSnooze={canWrite}
          vorschauId={vorschauParam}
        />
        <WeekendCard
          weekend={overview.weekend.markets}
          nextEvents={overview.nextEvents}
          today={today}
          vorschauId={vorschauId}
          marketToday={marketToday}
          className={marketToday ? "max-lg:order-first" : undefined}
        />
        <UpcomingPermitsCard
          due={overview.due}
          today={today}
          canSnooze={canWrite}
          className="lg:col-span-2"
        />
      </KeyboardRows>
      <p className="-mt-3 px-1 text-muted-foreground text-tiny touch:hidden">{t("keys")}</p>
      <PastMarketsLine count={overview.pastMarketTasks} query={sp} canCleanup={canWrite} />
      {vorschauId && <EventVorschau id={vorschauId} closeHref="/" />}
      {appointmentId && (
        <AppointmentVorschau
          id={appointmentId}
          closeHref={hrefWith("/", sp, { vorschau: undefined })}
          editHref={hrefWith("/", sp, {
            vorschau: undefined,
            neu: APPOINTMENT_PARAM,
            bearbeiten: appointmentId,
          })}
          reopenHref={hrefWith("/", sp, { vorschau: appointmentVorschauValue(appointmentId) })}
        />
      )}
      {taskDrawer}
      {/* "+ Neu › Aufgabe" outside an event page (was on the global Board, hidden 2026-11-03). */}
      {canWrite && param(sp.neu) === "1" && (
        <NewTaskButton
          urlOnly
          events={await listTaskEventOptions(actor, today)}
          staff={await listStaffOptions()}
          notifySelf={await getNotifySelf(actor)}
          canAssign={!isModuleHidden("team") && can(actor.role, "task", "assign")}
          today={today}
        />
      )}
      {canWrite && param(sp.aufraeumen) === "1" && (
        <PastMarketsDrawer actor={actor} today={today} query={sp} />
      )}
    </Page>
  );
}
