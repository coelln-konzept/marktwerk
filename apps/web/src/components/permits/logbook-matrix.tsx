import { DISPLAY_STATE_SEVERITY } from "@marktwerk/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Panel } from "@/components/ui/panel";
import { ScrollX } from "@/components/ui/scroll-x";
import { TH, THead, TR } from "@/components/ui/table";
import { PERMIT_TYPE_KEYS } from "@/lib/permit-status";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { LogbookRow } from "@/server/queries/permits";
import { PermitStateBadge } from "./permit-state-badge";

type Category = LogbookRow["category"];

/** The most urgent permit of a cell: worst state first, then the earliest deadline. */
function worst(rows: LogbookRow[]): LogbookRow {
  return [...rows].sort(
    (a, b) =>
      DISPLAY_STATE_SEVERITY[a.state] - DISPLAY_STATE_SEVERITY[b.state] ||
      (a.applyBy ?? "9999").localeCompare(b.applyBy ?? "9999"),
  )[0] as LogbookRow;
}

/**
 * The status quo at a glance: venues × permit types, grouped Stadt | Extern. Each cell shows the most
 * urgent permit as icon + text (never colour alone) and opens it in the drawer; the matrix stays visible.
 */
export function LogbookMatrix({
  rows,
  path,
  sp,
  selectedId,
}: {
  rows: LogbookRow[];
  path: string;
  sp: Record<string, string | string[] | undefined>;
  selectedId?: string;
}) {
  const t = useTranslations("logbook");
  const tTypes = useTranslations("permitTypes");
  const tState = useTranslations("permitStatus");
  const tCat = useTranslations("permitCategories");

  const venues = [
    ...new Map(
      rows.filter((r) => r.venueId).map((r) => [r.venueId as string, r.venueName ?? ""]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "de"));
  const columns = (category: Category) =>
    PERMIT_TYPE_KEYS.filter((type) =>
      rows.some((r) => r.category === category && r.permitType === type),
    );
  const groups = (["city", "external"] as const)
    .map((category) => ({ category, types: columns(category) }))
    .filter((g) => g.types.length > 0);
  const unassigned = rows.filter((r) => !r.venueId);

  return (
    <Panel className="overflow-hidden">
      <ScrollX hint={t("scrollHint")} label={t("matrixCaption")}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t("matrixCaption")}</caption>
          <THead>
            <tr>
              <TH rowSpan={2} className="sticky left-0 z-[3] min-w-40 bg-surface-2">
                {t("venueCol")}
              </TH>
              {groups.map((g) => (
                <th
                  key={g.category}
                  scope="colgroup"
                  colSpan={g.types.length}
                  className="h-8 border-b border-l px-3 text-left font-semibold text-foreground-2 text-tiny"
                >
                  {tCat(g.category)}
                </th>
              ))}
            </tr>
            <tr>
              {groups.flatMap((g) =>
                g.types.map((type, index) => (
                  <TH
                    key={`${g.category}-${type}`}
                    className={cn(
                      "whitespace-normal px-2 align-bottom leading-tight",
                      index === 0 && "border-l",
                    )}
                  >
                    {tTypes(type)}
                  </TH>
                )),
              )}
            </tr>
          </THead>
          <tbody>
            {venues.map(([venueId, venueName]) => (
              <TR key={venueId}>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] h-row min-w-40 max-w-56 bg-card px-3 py-(--cell-y) text-left font-semibold group-hover/row:bg-hover"
                >
                  <Link
                    href={`/orte/${venueId}` as never}
                    className="hover:text-accent-soft-foreground hover:underline"
                  >
                    {venueName}
                  </Link>
                </th>
                {groups.flatMap((g) =>
                  g.types.map((type, index) => {
                    const cell = rows.filter(
                      (r) =>
                        r.venueId === venueId && r.category === g.category && r.permitType === type,
                    );
                    return (
                      <td
                        key={`${g.category}-${type}`}
                        className={`h-row px-2 py-(--cell-y) align-middle ${index === 0 ? "border-l" : ""}`}
                      >
                        {cell.length === 0 ? (
                          <span className="text-faint-foreground">
                            <span aria-hidden>{t("none")}</span>
                            <span className="sr-only">{tState("not_required")}</span>
                          </span>
                        ) : (
                          <Link
                            href={hrefWith(path, sp, { genehmigung: worst(cell).id }) as never}
                            scroll={false}
                            aria-label={t("cellOpen", {
                              venue: venueName,
                              type: tTypes(type),
                              state: tState(worst(cell).state),
                            })}
                            aria-current={
                              cell.some((c) => c.id === selectedId) ? "true" : undefined
                            }
                            className="inline-flex items-center gap-1.5 rounded-full focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:ring-2 aria-[current=true]:ring-ring"
                          >
                            <PermitStateBadge state={worst(cell).state} />
                            {cell.length > 1 && (
                              <span
                                className="tabular text-muted-foreground text-tiny"
                                title={t("cellCount", { count: cell.length })}
                              >
                                {t("cellMore", { count: cell.length - 1 })}
                              </span>
                            )}
                          </Link>
                        )}
                      </td>
                    );
                  }),
                )}
              </TR>
            ))}
          </tbody>
        </table>
      </ScrollX>
      {unassigned.length > 0 && (
        <p className="border-t px-4 py-2 text-muted-foreground text-small">
          {t("cellCount", { count: unassigned.length })} · {t("venueCol")}: {t("none")}
        </p>
      )}
    </Panel>
  );
}
