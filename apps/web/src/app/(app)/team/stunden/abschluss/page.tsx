import { can, monthEnd, payrollCsv, payrollDeadline, UTF8_BOM } from "@marktwerk/core";
import { CircleCheck, CircleDashed, Clock, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { CloseActions } from "@/components/team/close-actions";
import { PeriodBadge } from "@/components/team/month-status";
import { monthParam } from "@/components/team/team-nav";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatHours, formatMoney, formatMonth, todayIn } from "@/lib/format";
import { param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/actor";
import {
  type CloseCheck,
  closeChecksOf,
  getMonthFigures,
  payrollRowsOf,
} from "@/server/queries/hours";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("hours.close"))("title") };
}

const STEPS = ["check", "lock", "approve", "export"] as const;

/** Team › Stunden › Abschluss: Prüfen ▸ Sperren ▸ Freigeben ▸ Exportieren (CSV) of one month. */
export default async function MonthClosePage({
  searchParams,
}: PageProps<"/team/stunden/abschluss">) {
  await requirePermission("team", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const [t, tNav, tTeam, locale] = await Promise.all([
    getTranslations("hours.close"),
    getTranslations("nav"),
    getTranslations("team"),
    getLocale(),
  ]);
  const today = todayIn();
  const month = monthParam(param(sp.month), today);
  const label = formatMonth(month, locale);
  const figures = await getMonthFigures(month, today);
  const status = figures.period?.status ?? "open";
  const checks = closeChecksOf(figures, today);
  const blockers = checks.filter((c) => c.level === "blocker");
  const canManage = can(actor.role, "team", "manage");
  const current = status === "open" ? 0 : status === "locked" ? 2 : status === "approved" ? 3 : 4;
  const rows = payrollRowsOf(figures);
  const csvLines = payrollCsv(rows).replace(UTF8_BOM, "").trimEnd().split("\r\n");
  const preview = csvLines.slice(0, 6);
  const gridHref = `/team/stunden?month=${month.slice(0, 7)}`;
  const shiftsHref = `/team/schichten?month=${month.slice(0, 7)}`;
  const totals = {
    people: figures.rows.length,
    minutes: figures.rows.reduce((sum, r) => sum + r.month.totalMinutes, 0),
    minijobCents: figures.rows
      .filter((r) => r.contractType === "minijob")
      .reduce((sum, r) => sum + r.month.grossCents, 0),
  };

  const byCode = (code: CloseCheck["code"]) => checks.find((c) => c.code === code);
  const people = (c: CloseCheck) => c.people.join(", ");
  const action = (code: CloseCheck["code"]) =>
    code === "missing_times"
      ? { href: shiftsHref, label: t("checks.enter") }
      : code === "overrun_unjustified" || code === "minijob_red"
        ? { href: gridHref, label: t("checks.justify") }
        : code === "arbzg"
          ? { href: gridHref, label: t("checks.view") }
          : undefined;

  type Line = {
    key: string;
    tone: "ok" | "warn" | "critical";
    text: string;
    link?: { href: string; label: string };
  };
  const lines: Line[] = [];
  const month_open = byCode("month_open");
  if (month_open)
    lines.push({
      key: "month_open",
      tone: "critical",
      text: t("checks.month_open", { date: formatDate(monthEnd(figures.month), locale) }),
    });
  const missing = byCode("missing_times");
  lines.push(
    missing
      ? {
          key: "missing",
          tone: "critical",
          text: t("checks.missing_times", { count: missing.count, people: people(missing) }),
          link: action("missing_times"),
        }
      : { key: "missing", tone: "ok", text: t("checks.missing_timesOk") },
  );
  const unjustified = byCode("overrun_unjustified");
  lines.push(
    unjustified
      ? {
          key: "unjustified",
          tone: "critical",
          text: t("checks.overrun_unjustified", { people: people(unjustified) }),
          link: action("overrun_unjustified"),
        }
      : { key: "unjustified", tone: "ok", text: t("checks.overrun_unjustifiedOk") },
  );
  const noContract = byCode("no_contract");
  lines.push(
    noContract
      ? {
          key: "contract",
          tone: "critical",
          text: t("checks.no_contract", { people: people(noContract) }),
          link: { href: "/team", label: t("checks.contracts") },
        }
      : { key: "contract", tone: "ok", text: t("checks.no_contractOk") },
  );
  const legal = byCode("legal_missing");
  if (legal) lines.push({ key: "legal", tone: "critical", text: t("checks.legal_missing") });
  const red = byCode("minijob_red");
  if (red)
    lines.push({
      key: "red",
      tone: "warn",
      text: t("checks.minijob_red", { people: people(red) }),
      link: action("minijob_red"),
    });
  const arbzg = byCode("arbzg");
  if (arbzg)
    lines.push({
      key: "arbzg",
      tone: "warn",
      text: t("checks.arbzg", { people: people(arbzg) }),
      link: action("arbzg"),
    });
  const other = byCode("other_minijob");
  if (other)
    lines.push({
      key: "other",
      tone: "warn",
      text: t("checks.other_minijob", { people: people(other) }),
    });

  const period = figures.period;
  const stamp = (at: Date | null, by: string | null) =>
    at
      ? [
          by,
          new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
            timeZone: "Europe/Berlin",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(at),
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  return (
    <Page
      crumbs={[
        { label: tNav("team"), href: "/team" },
        { label: tTeam("tabs.hours"), href: gridHref },
        { label: t("crumb") },
      ]}
    >
      <PageHeader
        title={t("heading", { month: label })}
        subtitle={t("deadline", { date: formatDate(payrollDeadline(figures.month), locale) })}
        actions={<PeriodBadge status={status} />}
      />

      <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0" aria-label={t("steps")}>
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current || (index === 0 && current === 0);
          return (
            <li
              key={step}
              className="flex items-center gap-2"
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 font-medium",
                  done && "border-transparent bg-status-ok-bg text-status-ok",
                  active && "border-primary bg-card text-foreground",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {done ? (
                  <CircleCheck aria-hidden className="size-4" />
                ) : (
                  <span className="tabular font-bold">{index + 1}</span>
                )}
                {t(`steps_${step}`)}
              </span>
              {index < STEPS.length - 1 && (
                <span aria-hidden className="text-faint-foreground">
                  ▸
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <Panel aria-labelledby="checks-title">
        <PanelHeader>
          <PanelTitle id="checks-title">{t("checksTitle")}</PanelTitle>
          <span className="tabular text-muted-foreground text-small">
            {t("totals", {
              people: totals.people,
              hours: formatHours(totals.minutes, locale),
              minijob: formatMoney(totals.minijobCents, locale),
            })}
          </span>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-2">
          {lines.map((line) => (
            <div
              key={line.key}
              className="flex min-h-12 flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
            >
              <StatusBadge
                tone={line.tone}
                icon={
                  line.tone === "ok" ? CircleCheck : line.tone === "warn" ? TriangleAlert : Clock
                }
              >
                {t(`level.${line.tone}`)}
              </StatusBadge>
              <span className="min-w-0 flex-1 text-small">{line.text}</span>
              {line.link && (
                <Link
                  href={line.link.href as never}
                  className="inline-flex min-h-7 items-center rounded-md border px-2 font-semibold text-tiny hover:bg-hover"
                >
                  {line.link.label}
                </Link>
              )}
            </div>
          ))}
        </PanelBody>
      </Panel>

      {status !== "open" && period && (
        <Panel aria-labelledby="period-title">
          <PanelHeader>
            <PanelTitle id="period-title">{t("periodTitle")}</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-1 text-small">
            {period.lockedAt && (
              <p className="m-0">
                {t("lockedBy", { by: stamp(period.lockedAt, period.lockedByName) ?? "" })}
              </p>
            )}
            {period.approvedAt && (
              <p className="m-0">
                {t("approvedBy", { by: stamp(period.approvedAt, period.approvedByName) ?? "" })}
              </p>
            )}
            {period.exportedAt && (
              <p className="m-0">{t("exportedAt", { by: stamp(period.exportedAt, null) ?? "" })}</p>
            )}
            {status === "exported" && (
              <p className="m-0 text-muted-foreground">{t("sendYourself")}</p>
            )}
          </PanelBody>
        </Panel>
      )}

      <Panel aria-labelledby="csv-title">
        <PanelHeader>
          <PanelTitle id="csv-title">
            {t("csvTitle", { file: `lohn_${month.slice(0, 7)}.csv` })}
          </PanelTitle>
          <span className="text-faint-foreground text-small">{t("csvHint")}</span>
        </PanelHeader>
        <PanelBody>
          {rows.length === 0 ? (
            <p className="m-0 flex items-center gap-2 text-muted-foreground">
              <CircleDashed aria-hidden className="size-4" />
              {t("csvEmpty")}
            </p>
          ) : (
            <pre className="m-0 overflow-x-auto rounded-lg bg-sunken p-3 text-[12px] leading-relaxed">
              {preview.join("\n")}
              {csvLines.length > preview.length ? "\n…" : ""}
            </pre>
          )}
        </PanelBody>
      </Panel>

      {canManage ? (
        <Panel aria-labelledby="actions-title">
          <PanelHeader>
            <PanelTitle id="actions-title">{t("actionsTitle")}</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <CloseActions
              month={figures.month}
              monthLabel={label}
              status={status}
              blockers={blockers.length}
            />
          </PanelBody>
        </Panel>
      ) : (
        <p className="m-0 flex items-center gap-2 text-muted-foreground text-small">
          <Info aria-hidden className="size-4" />
          {t("readOnly")}
        </p>
      )}
    </Page>
  );
}
