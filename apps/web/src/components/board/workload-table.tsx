import { isoWeek, type LoadLevel } from "@marktwerk/core";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { formatDateShort } from "@/lib/format";
import { formatHours } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { Workload } from "@/server/queries/tasks";

const CELL: Record<LoadLevel, string> = {
  ok: "bg-status-ok-bg text-status-ok",
  warn: "bg-status-warn-bg text-status-warn",
  critical: "bg-status-critical-bg text-status-critical",
};

/**
 * "Arbeitslast": estimated open hours per person and ISO week for the next 8 weeks. A cell is colour
 * and number ("14 h"), with the level as hidden text; capacity is the contract's hours per week
 * (default 20 h).
 */
export async function WorkloadTable({ workload }: { workload: Workload }) {
  const t = await getTranslations("board.workload");
  const tLoad = await getTranslations("board.load");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE", {
    maximumFractionDigits: 1,
  });

  return (
    <Panel>
      <PanelHeader>
        <div className="flex flex-col gap-0.5">
          <PanelTitle>{t("title")}</PanelTitle>
          <span className="text-muted-foreground text-tiny">{t("subtitle")}</span>
        </div>
      </PanelHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="bg-surface-2">
              <th
                scope="col"
                className="h-9 px-4 py-1 font-semibold text-muted-foreground text-tiny"
              >
                {t("person")}
              </th>
              <th
                scope="col"
                className="h-9 px-3 py-1 text-right font-semibold text-muted-foreground text-tiny"
              >
                {t("capacity")}
              </th>
              {workload.weeks.map((week) => (
                <th
                  key={week}
                  scope="col"
                  className="h-9 px-2 py-1 text-right font-semibold text-muted-foreground text-tiny"
                >
                  {locale === "en" ? "CW" : "KW"} {isoWeek(week).week}
                  <span className="block font-normal text-faint-foreground">
                    {formatDateShort(week, locale)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workload.rows.map((row) => (
              <tr key={row.staffMemberId ?? "nobody"} className="border-border-subtle border-t">
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <span className="flex items-center gap-2.5">
                    {row.name ? (
                      <Avatar name={row.name} size="lg" />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-full border border-input border-dashed text-faint-foreground">
                        ?
                      </span>
                    )}
                    <span className="font-semibold text-small">{row.name ?? t("unassigned")}</span>
                  </span>
                </th>
                <td className="tabular px-3 py-2 text-right text-muted-foreground text-small">
                  {row.staffMemberId ? formatHours(row.capacity[0] ?? 0, locale) : "–"}
                </td>
                {row.hours.map((hours, i) => {
                  const level = row.levels[i] ?? "ok";
                  const key = workload.weeks[i];
                  return (
                    <td key={key} className="px-2 py-2 text-right">
                      {hours > 0 ? (
                        <span
                          className={cn(
                            "tabular inline-block min-w-14 rounded-md px-2 py-1 text-small",
                            row.staffMemberId
                              ? CELL[level]
                              : "bg-status-neutral-bg text-foreground-2",
                          )}
                        >
                          {nf.format(hours)} h
                          {row.staffMemberId && <span className="sr-only"> ({tLoad(level)})</span>}
                        </span>
                      ) : (
                        <span className="text-faint-foreground text-small">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-border-subtle border-t px-4 py-2 text-muted-foreground text-tiny">
        {t("footnote")}
        {workload.undated > 0 && ` ${t("undated", { count: workload.undated })}`}
      </p>
    </Panel>
  );
}
