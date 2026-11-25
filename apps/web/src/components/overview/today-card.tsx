import { CalendarCheck, CalendarClock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { appointmentVorschauValue } from "@/components/appointments/appointment-params";
import { Panel, panelActionLink } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { rowFocus } from "@/components/ui/table";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { AppointmentView } from "@/server/queries/appointments";
import type { OverviewDue } from "@/server/queries/overview";
import { DueGroups } from "./due-groups";

/**
 * "Heute & nächste Tage", the main panel of the Übersicht (decision 2026-11-13): what to do today and what the
 * next days need. Today's Besprechungen first, then the groups Überfällig · Heute · Nächste Tage (due in the
 * next 7 days, with the date) and, when there are any, the tasks waiting for somebody else. Each group is
 * bundled per market in ranking order (`rankDue`: Kernaufgaben first, the soonest market first), with
 * one-click Erledigt and Zurückstellen; long markets and long groups open the rest in place.
 */
export async function TodayCard({
  due,
  appointments = [],
  today,
  canSnooze,
  vorschauId,
  className,
}: {
  due: OverviewDue;
  /** Today's Besprechungen (all-day first, then by time); the group is left out when there are none. */
  appointments?: AppointmentView[];
  today: string;
  canSnooze: boolean;
  /** The open Vorschau (`besprechung:<id>` for a Besprechung), to mark its row. */
  vorschauId?: string;
  className?: string;
}) {
  const t = await getTranslations("overview.due");
  // The next days and the waits; the permits further out have their own section at the bottom of the page.
  const next = due.later.filter((i) => i.urgency !== "upcoming");
  const items = [...due.items, ...next];
  return (
    <Panel
      title={t("title")}
      titleId="due-title"
      className={className}
      cardClassName="overflow-hidden"
      actions={
        isModuleVisible("notifications") && due.total > 0 ? (
          <Link href="/benachrichtigungen" className={panelActionLink}>
            {t("openCenter")}
          </Link>
        ) : undefined
      }
    >
      {appointments.length > 0 && (
        <AppointmentsToday appointments={appointments} selected={vorschauId} />
      )}
      {items.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <DueGroups
          items={items}
          groups={["overdue", "today", "soon", "waiting"]}
          today={today}
          canSnooze={canSnooze}
        />
      )}
    </Panel>
  );
}

/**
 * "Besprechungen heute": the first group of "Heute & nächste Tage", above the overdue items. All-day Besprechungen come
 * first, then by time; a row opens the Besprechung's Vorschau (`/?vorschau=besprechung:<id>`).
 */
async function AppointmentsToday({
  appointments,
  selected,
}: {
  appointments: AppointmentView[];
  selected?: string;
}) {
  const t = await getTranslations("overview.due.appointments");
  const tChip = await getTranslations("appointments.chip");
  return (
    <section aria-labelledby="appointments-today-title">
      <h3
        id="appointments-today-title"
        className="m-0 flex items-center gap-2 border-border border-y bg-status-neutral-bg px-4 py-1.5 font-semibold text-small first:border-t-0"
      >
        <CalendarClock aria-hidden className="size-4" />
        {t("title")}
        <span className="tabular font-normal text-muted-foreground">
          {t("count", { count: appointments.length })}
        </span>
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {appointments.map((a) => {
          const href = `/?vorschau=${appointmentVorschauValue(a.id)}`;
          const where = a.venueName ?? a.locationText;
          return (
            <li
              key={a.id}
              data-row
              data-href={href}
              data-peek={href}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
              tabIndex={0}
              className={cn(
                "flex cursor-pointer items-baseline gap-3 border-border-subtle border-b px-4 py-2 last:border-b-0 hover:bg-hover",
                rowFocus,
                selected === appointmentVorschauValue(a.id) && "bg-selected",
              )}
            >
              <span className="tabular w-16 shrink-0 font-semibold text-foreground-2 text-small">
                {a.startsAt ?? tChip("allDay")}
              </span>
              <span className="min-w-0 flex-1 break-words">
                <Link
                  href={href as never}
                  scroll={false}
                  aria-label={`${t("open")}: ${a.title}`}
                  className="font-medium hover:underline"
                >
                  {a.title}
                </Link>
                {where && <span className="text-muted-foreground text-small"> · {where}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "Genehmigungen demnächst" (CF9-6): permits further out than 7 days but inside the permit horizon. Since
 * 2026-11-13 the last section of the Übersicht, full width under the main panel and the weekend box. The
 * same rows as everywhere (snooze, J/K); the shield marks the heading in the info colour. Empty → one line.
 */
export async function UpcomingPermitsCard({
  due,
  today,
  canSnooze,
  className,
}: {
  due: OverviewDue;
  today: string;
  canSnooze: boolean;
  className?: string;
}) {
  const t = await getTranslations("overview.due");
  const upcoming = due.later.filter((i) => i.urgency === "upcoming");
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck aria-hidden className="size-[18px] text-status-info" />
          {t("groups.upcoming")}
        </span>
      }
      titleId="upcoming-title"
      className={className}
      cardClassName="overflow-hidden"
    >
      {upcoming.length === 0 ? (
        <p className="m-0 px-4 py-3 text-muted-foreground text-small">{t("upcomingEmpty")}</p>
      ) : (
        <DueGroups
          items={upcoming}
          groups={["upcoming"]}
          bandless={["upcoming"]}
          today={today}
          canSnooze={canSnooze}
        />
      )}
    </Panel>
  );
}
