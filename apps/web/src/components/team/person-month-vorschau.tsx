import { can } from "@marktwerk/core";
import { Ban, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { formatDateShort, formatHours, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Actor } from "@/server/actor";
import type { MonthFigures, ShiftRow } from "@/server/queries/hours";
import { JustificationForm } from "./justification-form";
import { PersonStatusBadge, personLevel } from "./month-status";

/**
 * Vorschau of one person in one month (flow 4): earnings, hours, remaining allowance, year to date,
 * overrun months, the justification for an overrun and the shifts of the month.
 */
export async function PersonMonthVorschau({
  figures,
  personId,
  shifts,
  closeHref,
  actor,
}: {
  figures: MonthFigures;
  personId: string;
  shifts: ShiftRow[];
  closeHref: string;
  actor: Actor;
}) {
  const row = figures.rows.find((r) => r.staffMemberId === personId);
  if (!row) return null;
  const [t, tContract, locale] = await Promise.all([
    getTranslations("hours.vorschau"),
    getTranslations("hours.contract"),
    getLocale(),
  ]);
  const mj = row.minijob;
  const month = figures.month;
  const level = personLevel(row);
  const over = mj ? mj.status.earnedCents > mj.params.limitCents : false;
  const open = (figures.period?.status ?? "open") === "open";
  const canManage = can(actor.role, "team", "manage");
  const none = <span className="text-faint-foreground">–</span>;

  return (
    <Vorschau
      kind={t("kind", { month: month.slice(0, 7) })}
      title={row.displayName}
      closeHref={closeHref}
      badges={<PersonStatusBadge level={level} />}
    >
      <div className="flex items-center gap-3">
        <Avatar name={row.displayName} size="lg" />
        <p className="m-0 text-muted-foreground text-small">
          {row.contractType ? tContract(`types.${row.contractType}`) : t("noContract")}
          {row.month.otherMinijobDeclared ? ` · ${t("otherMinijob")}` : ""}
        </p>
      </div>
      <Facts
        items={[
          {
            label: t("earnings"),
            value: (
              <span className="tabular font-semibold">
                {formatMoney(row.month.grossCents, locale)}
              </span>
            ),
          },
          {
            label: t("hours"),
            value: (
              <span className="tabular">
                {formatHours(row.month.workedMinutes, locale)}
                {row.month.plannedMinutes > 0 &&
                  ` + ${formatHours(row.month.plannedMinutes, locale)} ${t("planned")}`}
              </span>
            ),
          },
          ...(mj
            ? [
                {
                  label: t("remaining"),
                  value: (
                    <span className="tabular">
                      {over
                        ? t("overBy", {
                            amount: formatMoney(
                              mj.status.earnedCents - mj.params.limitCents,
                              locale,
                            ),
                          })
                        : formatHours(mj.status.remainingMinutes, locale)}
                    </span>
                  ),
                },
                {
                  label: t("ytd"),
                  value: <span className="tabular">{formatMoney(mj.ytdCents, locale)}</span>,
                },
                {
                  label: t("overruns"),
                  value: (
                    <span className="tabular">
                      {mj.overrunMonths} / {mj.params.maxOverrunMonths}
                    </span>
                  ),
                },
              ]
            : []),
          {
            label: t("missing"),
            value:
              row.missingTimes > 0 ? <span className="tabular">{row.missingTimes}</span> : none,
          },
        ]}
      />

      {mj && over && (
        <section aria-labelledby="pv-justify" className="flex flex-col gap-2">
          <h3 id="pv-justify" className="font-semibold text-muted-foreground text-tiny">
            {t("justification")}
          </h3>
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg p-3 text-small",
              mj.status.level === "red"
                ? "bg-status-critical-bg text-status-critical"
                : "bg-status-warn-bg text-status-warn",
            )}
          >
            {mj.status.level === "red" ? (
              <Ban aria-hidden className="mt-0.5 size-4 shrink-0" />
            ) : (
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {mj.status.level === "red"
                ? t("redText", {
                    reasons: mj.status.reasons.map((r) => t(`reasons.${r}`)).join(" · "),
                  })
                : t("amberText", {
                    earned: formatMoney(mj.status.earnedCents, locale),
                    limit: formatMoney(mj.params.limitCents, locale),
                    months: mj.params.maxOverrunMonths,
                    ceiling: formatMoney(
                      mj.params.limitCents * mj.params.overrunCeilingFactor,
                      locale,
                    ),
                  })}
            </span>
          </div>
          <JustificationForm
            staffMemberId={row.staffMemberId}
            month={month}
            saved={
              row.justification
                ? {
                    reason: row.justification.reason,
                    meta: [
                      row.justification.recordedByName,
                      new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
                        timeZone: "Europe/Berlin",
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(row.justification.at),
                    ]
                      .filter(Boolean)
                      .join(", "),
                  }
                : null
            }
            canEdit={canManage && open}
            red={mj.status.level === "red"}
          />
        </section>
      )}

      {row.arbzg.length > 0 && (
        <section aria-labelledby="pv-arbzg" className="flex flex-col gap-1">
          <h3 id="pv-arbzg" className="font-semibold text-muted-foreground text-tiny">
            {t("arbzg")}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-small">
            {row.arbzg.map((w) => (
              <li key={`${w.code}-${w.date}`} className="flex items-start gap-1.5">
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-status-warn" />
                <span>
                  <span className="tabular">{formatDateShort(w.date, locale)}</span>
                  {" · "}
                  {w.code === "daily_max"
                    ? t("arbzgDailyMax", {
                        hours: formatHours(w.minutes, locale),
                        limit: formatHours(w.limit, locale),
                      })
                    : w.code === "rest_period"
                      ? t("arbzgRest", {
                          rest: formatHours(w.restMinutes, locale),
                          limit: formatHours(w.limit, locale),
                        })
                      : w.code === "break_missing"
                        ? t("arbzgBreak", { minutes: w.required })
                        : t("arbzgOverlap")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pv-shifts" className="flex flex-col gap-1.5">
        <h3 id="pv-shifts" className="font-semibold text-muted-foreground text-tiny">
          {t("shifts", { month: month.slice(0, 7) })}
        </h3>
        {shifts.length === 0 ? (
          <p className="m-0 text-faint-foreground">{t("noShifts")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-small">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="tabular text-muted-foreground">
                    {formatDateShort(s.workDate, locale)}
                  </span>
                  {" · "}
                  {s.eventId && s.eventName ? (
                    <Link
                      href={`/veranstaltungen/${s.eventId}/team` as never}
                      className="text-accent-soft-foreground hover:underline"
                    >
                      {s.eventName}
                    </Link>
                  ) : (
                    t("office")
                  )}
                </span>
                <span className="tabular shrink-0">
                  {formatNumber(s.minutes / 60, locale, 2)} h
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/team/schichten?month=${month.slice(0, 7)}&person=${row.staffMemberId}` as never}
          className="text-accent-soft-foreground text-small hover:underline"
        >
          {t("openShifts")}
        </Link>
      </section>
    </Vorschau>
  );
}
