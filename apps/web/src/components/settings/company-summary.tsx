import { formatIban } from "@marktwerk/core/company/identifiers";
import { getTranslations } from "next-intl/server";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { CompanySettings } from "@/server/queries/settings";

/** Read-only view of the company data for everyone without `settings:manage`. */
export async function CompanySummary({ settings }: { settings: CompanySettings }) {
  const [t, tSettings] = await Promise.all([
    getTranslations("settings.company"),
    getTranslations("settings"),
  ]);
  const none = <span className="text-faint-foreground">{tSettings("noValue")}</span>;
  const value = (v: string) => (v ? v : none);
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.postalCode, settings.city].filter(Boolean).join(" "),
  ].filter(Boolean);

  const sections: { key: string; rows: { label: string; value: React.ReactNode }[] }[] = [
    {
      key: "identity",
      rows: [{ label: t("fields.companyName"), value: value(settings.companyName) }],
    },
    {
      key: "address",
      rows: [
        {
          label: t("sections.address"),
          value:
            address.length > 0 ? (
              <>
                {address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
                <span className="block">{settings.country}</span>
              </>
            ) : (
              none
            ),
        },
      ],
    },
    {
      key: "contact",
      rows: [
        { label: t("fields.email"), value: value(settings.email) },
        { label: t("fields.phone"), value: value(settings.phone) },
      ],
    },
    {
      key: "bank",
      rows: [
        { label: t("fields.taxNumber"), value: value(settings.taxNumber) },
        { label: t("fields.vatId"), value: value(settings.vatId) },
        { label: t("fields.iban"), value: settings.iban ? formatIban(settings.iban) : none },
        { label: t("fields.bic"), value: value(settings.bic) },
      ],
    },
    {
      key: "operations",
      rows: [
        { label: t("fields.timeZone"), value: settings.timeZone },
        {
          label: t("fields.bundesland"),
          value: t.has(`bundeslaender.${settings.bundesland}` as never)
            ? t(`bundeslaender.${settings.bundesland}` as never)
            : settings.bundesland,
        },
        {
          label: t("fields.defaultLocale"),
          value: t.has(`locales.${settings.defaultLocale}` as never)
            ? t(`locales.${settings.defaultLocale}` as never)
            : settings.defaultLocale,
        },
        { label: t("fields.defaultDueTime"), value: t("time", { time: settings.defaultDueTime }) },
        {
          label: t("fields.emailEnabled"),
          value: settings.emailEnabled ? t("digestOn") : t("digestOff"),
        },
        {
          label: t("fields.dailyDigestEnabled"),
          value: settings.dailyDigestEnabled ? t("digestOn") : t("digestOff"),
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <Panel key={section.key} aria-labelledby={`company-${section.key}`}>
          <PanelHeader>
            <PanelTitle id={`company-${section.key}`}>
              {t(`sections.${section.key}` as never)}
            </PanelTitle>
          </PanelHeader>
          <PanelBody>
            <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[14rem_1fr]">
              {section.rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="m-0 min-w-0 break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}
