import { can } from "@marktwerk/core";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EventVorschau } from "@/components/events/event-vorschau";
import { PastMarketsDrawer, PastMarketsLine } from "@/components/overview/past-markets";
import { TodayCard } from "@/components/overview/today-card";
import { WeekendCard } from "@/components/overview/weekend-card";
import { Page, PageHeader } from "@/components/shell/page";
import { TaskDrawer } from "@/components/task/task-drawer";
import { Drawer } from "@/components/ui/drawer";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { formatDate, formatWeek, todayIn } from "@/lib/format";
import { HIDDEN_MODULES, isModuleHidden } from "@/lib/modules";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { getOverview } from "@/server/queries/overview";
import { getTaskDetail, listStaffOptions } from "@/server/queries/tasks";

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
 * The Übersicht answers two questions side by side: "is the weekend on track?" (verdict per market,
 * first blockers) and "what is due today?" (top five, Erledigt in one click). A task opens its drawer
 * here (`?aufgabe=<id>`, like on the board), a market its Vorschau (`?vorschau=<id>`).
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
  const part = hour < 11 ? "morning" : hour < 17 ? "day" : "evening";
  const weekday = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${today}T12:00:00Z`));
  const overview = await getOverview(actor, today, HIDDEN_MODULES);
  const vorschauId = param(sp.vorschau);
  const taskId = param(sp.aufgabe);
  const canWrite = can(actor.role, "task", "write");

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
      {/* One KeyboardRows around both cards: J/K walk the weekend first, then today's list. */}
      <KeyboardRows className="grid gap-4 lg:grid-cols-2">
        <WeekendCard
          weekend={overview.weekend}
          next={overview.nextWeekend}
          nextEvent={overview.nextEvent}
          today={today}
          vorschauId={vorschauId}
        />
        <TodayCard due={overview.due} today={today} canSnooze={canWrite} />
      </KeyboardRows>
      <p className="-mt-3 px-1 text-muted-foreground text-tiny touch:hidden">{t("keys")}</p>
      <PastMarketsLine count={overview.pastMarketTasks} query={sp} canCleanup={canWrite} />
      {vorschauId && <EventVorschau id={vorschauId} closeHref="/" />}
      {taskDrawer}
      {canWrite && param(sp.aufraeumen) === "1" && (
        <PastMarketsDrawer actor={actor} today={today} query={sp} />
      )}
    </Page>
  );
}
