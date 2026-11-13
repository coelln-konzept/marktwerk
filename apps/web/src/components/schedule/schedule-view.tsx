import { addDays, daysBetween, rowsForDay, type ScheduleRow, sameSchedule } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { formatDateWithWeekday } from "@/lib/format";

type Group = { key: string; heading: string; rows: ScheduleRow[] };

/**
 * The full Zeitplan of an event, grouped by day (ADR 0022): the day before (if it has rows), then the
 * event days; consecutive days with the same rows share one group ("Sa 12.04.2026 – So 13.04.2026").
 * Works in server and client components.
 */
export function ScheduleView({
  schedule,
  startsOn,
  endsOn,
}: {
  schedule: readonly ScheduleRow[];
  startsOn: string;
  endsOn: string;
}) {
  const t = useTranslations("schedule");
  const locale = useLocale();
  const duration = Math.max(1, daysBetween(startsOn, endsOn) + 1);
  const date = (index: number) => formatDateWithWeekday(addDays(startsOn, index), locale);

  const groups: Group[] = [];
  const before = rowsForDay(schedule, -1, duration);
  if (before.length > 0)
    groups.push({ key: "before", heading: t("view.before", { date: date(-1) }), rows: before });
  let start = 0;
  for (let day = 0; day < duration; day += 1) {
    const rows = rowsForDay(schedule, day, duration);
    const next = day + 1 < duration ? rowsForDay(schedule, day + 1, duration) : null;
    if (next && sameSchedule(rows, next)) continue;
    if (rows.length > 0)
      groups.push({
        key: `day-${start}`,
        heading: start === day ? date(day) : `${date(start)} – ${date(day)}`,
        rows,
      });
    start = day + 1;
  }

  if (groups.length === 0) return <span className="text-muted-foreground">{t("view.empty")}</span>;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.key}>
          {(groups.length > 1 || duration > 1) && (
            <p className="m-0 mb-1 font-medium text-small">{group.heading}</p>
          )}
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {group.rows.map((row) => (
              <li
                key={`${row.audience}-${row.kind}-${row.day}-${row.from}-${row.to}`}
                className="flex flex-wrap justify-between gap-x-4"
              >
                <span>
                  {t("view.row", {
                    audience: t(`audience.${row.audience}`),
                    kind: t(`kind.${row.kind}`),
                  })}
                </span>
                <span className="tabular text-muted-foreground">
                  {t("hours", { from: row.from, to: row.to })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
