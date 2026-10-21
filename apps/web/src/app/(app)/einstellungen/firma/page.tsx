import { can } from "@marktwerk/core";
import { Info } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CompanyForm } from "@/components/settings/company-form";
import { CompanySummary } from "@/components/settings/company-summary";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Page } from "@/components/shell/page";
import { getCompanySettings } from "@/server/queries/settings";
import { LOCALES, SUPPORTED_BUNDESLAENDER } from "@/server/services/settings";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("tabs.company")} · ${t("title")}` };
}

export default async function CompanySettingsPage() {
  const user = await requirePermission("settings", "read");
  const [t, tNav, settings] = await Promise.all([
    getTranslations("settings"),
    getTranslations("nav"),
    getCompanySettings(),
  ]);
  const canManage = can(user.role, "settings", "manage");
  const { exists, timeZone, ...values } = settings;

  return (
    <Page
      crumbs={[
        { label: tNav("settings"), href: "/einstellungen/firma" },
        { label: t("tabs.company") },
      ]}
    >
      <SettingsHeader />
      {canManage ? (
        <>
          {!exists && (
            <p className="m-0 flex items-center gap-2 text-muted-foreground text-small">
              <Info aria-hidden className="size-4" />
              {t("company.notCreated")}
            </p>
          )}
          <CompanyForm
            initial={values}
            timeZone={timeZone}
            created={exists}
            options={{ bundeslaender: [...SUPPORTED_BUNDESLAENDER], locales: [...LOCALES] }}
          />
        </>
      ) : (
        <>
          <p className="m-0 flex items-center gap-2 text-muted-foreground text-small">
            <Info aria-hidden className="size-4" />
            {t("company.readOnly")}
          </p>
          <CompanySummary settings={settings} />
        </>
      )}
    </Page>
  );
}
