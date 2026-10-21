import { CircleCheck, CircleDashed, Hourglass, Info, Scale } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Page } from "@/components/shell/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TGroup, TH, THead, TR } from "@/components/ui/table";
import { formatDate, todayIn } from "@/lib/format";
import { formatLegalAmount, legalUnit } from "@/lib/legal";
import { listLegalParameters } from "@/server/queries/settings";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("tabs.legal")} · ${t("title")}` };
}

export default async function LegalSettingsPage() {
  await requirePermission("settings", "read");
  const [t, tNav, locale] = await Promise.all([
    getTranslations("settings"),
    getTranslations("nav"),
    getLocale(),
  ]);
  const rows = await listLegalParameters(todayIn());

  const keyLabel = (key: string) =>
    t.has(`legal.keyLabels.${key}` as never) ? t(`legal.keyLabels.${key}` as never) : key;
  const none = <span className="text-faint-foreground">{t("noValue")}</span>;

  return (
    <Page
      crumbs={[
        { label: tNav("settings"), href: "/einstellungen/firma" },
        { label: t("tabs.legal") },
      ]}
    >
      <SettingsHeader />
      <p className="m-0 flex items-center gap-2 text-muted-foreground text-small">
        <Info aria-hidden className="size-4 shrink-0" />
        {t("legal.subtitle")}
      </p>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={Scale} title={t("legal.empty")} />
        ) : (
          <Table>
            <caption className="sr-only">{t("legal.caption")}</caption>
            <THead>
              <tr>
                <TH>{t("legal.cols.value")}</TH>
                <TH>{t("legal.cols.validFrom")}</TH>
                <TH>{t("legal.cols.validUntil")}</TH>
                <TH>{t("legal.cols.status")}</TH>
                <TH>{t("legal.cols.source")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((row, i) => {
                const first = i === 0 || rows[i - 1]?.key !== row.key;
                const amount = formatLegalAmount(row.key, row.value, locale);
                return [
                  first && (
                    <TGroup key={`g-${row.key}`} colSpan={5}>
                      {keyLabel(row.key)}
                      {keyLabel(row.key) !== row.key && (
                        <span className="ml-2 font-normal text-faint-foreground">{row.key}</span>
                      )}
                    </TGroup>
                  ),
                  <TR key={row.id}>
                    <TD className="tabular whitespace-nowrap font-semibold">
                      {t(`legal.units.${legalUnit(row.key)}`, { amount })}
                    </TD>
                    <TD className="tabular whitespace-nowrap">
                      {formatDate(row.validFrom, locale)}
                    </TD>
                    <TD className="tabular whitespace-nowrap">
                      {row.validUntil ? formatDate(row.validUntil, locale) : t("legal.openEnded")}
                    </TD>
                    <TD>
                      {row.state === "current" ? (
                        <StatusBadge tone="ok" icon={CircleCheck}>
                          {t("legal.states.current")}
                        </StatusBadge>
                      ) : row.state === "future" ? (
                        <StatusBadge tone="info" icon={Hourglass}>
                          {t("legal.states.future", { date: formatDate(row.validFrom, locale) })}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral" icon={CircleDashed}>
                          {t("legal.states.past")}
                        </StatusBadge>
                      )}
                    </TD>
                    <TD className="max-w-80">{row.note ?? none}</TD>
                  </TR>,
                ];
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </Page>
  );
}
