import { CalendarCheck, CalendarClock, CalendarDays } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { AppointmentView } from "@/server/queries/appointments";
import type { OverviewDue } from "@/server/queries/overview";
import { DueGroups } from "./due-groups";

/**
 * "Heute & überfällig" (what is due now?): every overdue and due-today item, bundled per market in ranking
 * order (`rankDue`: Kernaufgaben first, the soonest market first), with one-click Erledigt and
 * Zurückstellen. Long markets and long groups open the rest in place.
 */
export async function TodayCard({
  due,
  appointments = [],
  today,
  canSnooze,
  vorschauId,
}: {
  due: OverviewDue;
  /** Today's Termine (all-day first, then by time); the group is left out when there are none. */
  appointments?: AppointmentView[];
  today: string;
  canSnooze: boolean;
  /** The open Vorschau (`termin:<id>` for a Termin), to mark its row. */
  vorschauId?: string;
}) {
  const t = await getTranslations("overview.due");
  return (
    <Panel aria-labelledby="due-title" className="flex min-w-0 flex-col">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="due-title">{t("title")}</PanelTitle>
          <span className="text-muted-foreground text-small">{t("subtitle")}</span>
        </div>
      </PanelHeader>
      {appointments.length > 0 && (
        <AppointmentsToday appointments={appointments} selected={vorschauId} />
      )}
      {due.items.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <DueGroups
          items={due.items}
          groups={["overdue", "today"]}
          today={today}
          canSnooze={canSnooze}
        />
      )}
      {isModuleVisible("notifications") && due.total > 0 && (
        <div className="mt-auto border-border-subtle border-t px-2 py-1.5">
          <Link
            href="/benachrichtigungen"
            className="inline-flex min-h-8 items-center rounded-lg px-2 font-medium text-muted-foreground text-small hover:bg-hover hover:text-foreground"
          >
            {t("openCenter")}
          </Link>
        </div>
      )}
    </Panel>
  );
}

/**
 * "Termine heute": the first group of "Heute & überfällig", above the overdue items. All-day Termine come
 * first, then by time; a row opens the Termin's Vorschau (`/?vorschau=termin:<id>`).
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
    <section aria-labelledby="termine-heute-title">
      <h3
        id="termine-heute-title"
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
          const href = `/?vorschau=termin:${a.id}`;
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
                "flex cursor-pointer items-baseline gap-3 border-border-subtle border-b px-4 py-2 last:border-b-0 hover:bg-hover focus-visible:bg-selected",
                selected === `termin:${a.id}` && "bg-selected",
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
 * "Diese Woche" (what does the week need?): items due in the next 7 days, bundled per market, then
 * permits due within the horizon ("Genehmigungen demnächst") and tasks waiting for somebody else.
 */
export async function WeekCard({
  due,
  today,
  canSnooze,
}: {
  due: OverviewDue;
  today: string;
  canSnooze: boolean;
}) {
  const t = await getTranslations("overview.due");
  const soon = due.later.filter((i) => i.urgency === "soon").length;
  return (
    <Panel aria-labelledby="week-title" className="min-w-0">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="week-title">{t("groups.soon")}</PanelTitle>
          <span className="tabular text-muted-foreground text-small">
            {t("weekSubtitle", { count: soon })}
          </span>
        </div>
      </PanelHeader>
      {due.later.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("weekEmpty")} />
      ) : (
        <DueGroups
          items={due.later}
          groups={["soon", "upcoming", "waiting"]}
          bandless={["soon"]}
          today={today}
          canSnooze={canSnooze}
        />
      )}
    </Panel>
  );
}
