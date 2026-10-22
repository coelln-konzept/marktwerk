import { canMoveEvent, daysBetween, isHappening } from "@marktwerk/core";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Health, HealthShape } from "@/components/ui/health";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateWithWeekday, formatMoney, formatNumber, todayIn } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import type { EventDetail } from "@/server/queries/events";
import { FactsDialog } from "./facts-dialog";
import { MoveDialog } from "./move-dialog";
import { roleName } from "./role-name";

const ANCHOR_ORDER = ["event_day", "setup_day", "teardown_day", "booking_cutoff"] as const;

/** "Termine & Fristen": every anchor of the event with weekday, date and the distance from today. */
export async function DatesPanel({
  event,
  today,
  canWrite,
}: {
  event: EventDetail;
  today: string;
  canWrite: boolean;
}) {
  const t = await getTranslations("eventDetail.overview.dates");
  const locale = await getLocale();
  const byKey = new Map(event.anchors.map((a) => [a.key, a.date]));
  // Older data may lack the teardown anchor: the last event day is the teardown day then.
  if (!byKey.has("teardown_day")) byKey.set("teardown_day", event.endsOn);
  const known = ANCHOR_ORDER.flatMap((key) => {
    const date = byKey.get(key);
    return date ? [{ key, date }] : [];
  });
  const custom = event.anchors.filter((a) => !(ANCHOR_ORDER as readonly string[]).includes(a.key));
  const rows = [...known, ...custom.map((a) => ({ key: a.key, date: a.date }))];

  const relative = (date: string) => {
    const n = daysBetween(today, date);
    if (n === 0) return t("today");
    return n > 0 ? t("inDays", { n }) : t("daysAgo", { n: -n });
  };

  return (
    <Panel aria-labelledby="dates-title">
      <PanelHeader>
        <PanelTitle id="dates-title">{t("title")}</PanelTitle>
        {canWrite && canMoveEvent(event.status) && (
          <MoveDialog eventId={event.id} startsOn={event.startsOn} />
        )}
      </PanelHeader>
      {rows.length === 0 ? (
        <PanelBody className="text-muted-foreground text-small">{t("empty")}</PanelBody>
      ) : (
        <Table>
          <caption className="sr-only">{t("caption")}</caption>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("what")}</TH>
              <TH>{t("date")}</TH>
              <TH className="text-right">{t("relative")}</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.key}>
                <TD className="font-medium">
                  {t.has(`keys.${row.key}` as never) ? t(`keys.${row.key}` as never) : row.key}
                </TD>
                <TD className="tabular">{formatDateWithWeekday(row.date, locale)}</TD>
                <TD className="tabular text-right text-foreground-2">{relative(row.date)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-border-subtle border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground text-small">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** "Eckdaten": venue, times, prices and the rules of the event type. */
export async function FactsPanel({ event, canWrite }: { event: EventDetail; canWrite: boolean }) {
  const t = await getTranslations("eventDetail.overview.facts");
  const locale = await getLocale();
  const { venue, type, times } = event;
  const rules = type.rules;
  const address = [venue.street, [venue.postalCode, venue.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const share = formatNumber(Math.round(rules.newGoodsMaxShare * 100), locale, 0);
  return (
    <Panel aria-labelledby="facts-title">
      <PanelHeader>
        <PanelTitle id="facts-title">{t("title")}</PanelTitle>
        {canWrite && (
          <FactsDialog
            eventId={event.id}
            multiDay={event.endsOn !== event.startsOn}
            happening={isHappening(event, todayIn())}
            facts={{
              times: event.times,
              pricePerMCents: event.pricePerMCents,
              bookingFeeCents: event.bookingFeeCents,
            }}
          />
        )}
      </PanelHeader>
      <PanelBody>
        <dl>
          <Fact label={t("venue")}>
            <Link
              href={`/orte/${venue.id}` as never}
              className="font-medium underline-offset-2 hover:underline"
            >
              {venue.name}
            </Link>
            <span className="block text-muted-foreground text-small">{address}</span>
          </Fact>
          <Fact label={t("times")}>
            <span className="tabular">
              {t("timesValue", {
                setup: times.setup,
                open: times.open,
                close: times.close,
                teardown: times.teardown,
              })}
            </span>
          </Fact>
          <Fact label={t("price")}>
            <span className="tabular">
              {t("pricePerM", { price: formatMoney(event.pricePerMCents, locale) })}
            </span>
          </Fact>
          <Fact label={t("fee")}>
            <span className="tabular">{formatMoney(event.bookingFeeCents, locale)}</span>
          </Fact>
          <Fact label={t("rules")}>
            <ul className="flex flex-col gap-0.5">
              <li>{t("newGoods", { share })}</li>
              <li>
                {rules.bannedGoods.length > 0
                  ? t("bannedGoods", { goods: rules.bannedGoods.join(", ") })
                  : t("noBannedGoods")}
              </li>
              <li>
                {t("onlineBooking", {
                  value: rules.onlineBookingAllowed ? t("yes") : t("no"),
                })}
              </li>
            </ul>
          </Fact>
          {event.status === "cancelled" && event.cancelledReason && (
            <Fact label={t("cancelledReason")}>{event.cancelledReason}</Fact>
          )}
        </dl>
      </PanelBody>
    </Panel>
  );
}

/** "Team" summary: duties filled x/y with health, the open ones named, link to the Team tab. */
export async function TeamSummaryPanel({ event }: { event: EventDetail }) {
  const t = await getTranslations("eventDetail.overview.team");
  const tHealth = await getTranslations("health");
  const locale = await getLocale();
  const total = event.duties.length;
  const open = event.duties.filter((d) => !d.staffMemberId);
  const assigned = total - open.length;
  const level = event.health.team ?? "none";
  return (
    <Panel aria-labelledby="team-title">
      <PanelHeader>
        <PanelTitle id="team-title">{t("title")}</PanelTitle>
        <Link
          href={`/veranstaltungen/${event.id}/team` as never}
          className="inline-flex items-center gap-1 text-accent-soft-foreground text-small hover:underline"
        >
          {t("link")}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-2">
        <Health level={level} label={`${t("summary", { assigned, total })} · ${tHealth(level)}`} />
        <p className="text-foreground-2 text-small">
          {open.length === 0
            ? t("allSet")
            : t("open", { roles: open.map((d) => roleName(d, locale)).join(", ") })}
        </p>
      </PanelBody>
    </Panel>
  );
}

/** "Zustand": the four health dimensions; permits/tasks/money show when they start being tracked. */
export async function HealthPanel({ event }: { event: EventDetail }) {
  const t = await getTranslations("eventDetail.overview.health");
  const tHealth = await getTranslations("health");
  const total = event.duties.length;
  const assigned = event.duties.filter((d) => d.staffMemberId).length;
  const rows = [
    { key: "permits", level: event.health.permits, note: t("permitsNote") },
    { key: "tasks", level: event.health.tasks, note: t("tasksNote") },
    { key: "team", level: event.health.team, note: t("teamNote", { assigned, total }) },
    { key: "money", level: event.health.money, note: t("moneyNote") },
  ] as const;
  const visibleRows = rows.filter(
    (row) =>
      (row.key !== "team" || isModuleVisible("team")) &&
      (row.key !== "money" || isModuleVisible("finance")),
  );
  return (
    <Panel aria-labelledby="health-title">
      <PanelHeader>
        <PanelTitle id="health-title">{t("title")}</PanelTitle>
      </PanelHeader>
      <PanelBody>
        <ul className="flex flex-col">
          {visibleRows.map((row) => {
            const level = row.level ?? "none";
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-border-subtle border-b py-2 first:pt-0 last:border-b-0 last:pb-0"
              >
                <HealthShape level={level} />
                <span className="w-32 font-medium">{t(row.key)}</span>
                <span className="text-small">{tHealth(level)}</span>
                <span className="text-muted-foreground text-small">{row.note}</span>
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
