import { CalendarCheck, CalendarDays } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { isModuleVisible } from "@/lib/modules";
import type { OverviewDue } from "@/server/queries/overview";
import { DueGroups } from "./due-groups";

/**
 * "Heute & überfällig" (what is due now?): every overdue and due-today item, bundled per market in ranking
 * order (`rankDue`: Kernaufgaben first, the soonest market first), with one-click Erledigt and
 * Zurückstellen. Long markets and long groups open the rest in place.
 */
export async function TodayCard({
  due,
  today,
  canSnooze,
}: {
  due: OverviewDue;
  today: string;
  canSnooze: boolean;
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
