import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page";
import { SettingsTabs } from "./settings-tabs";

export const SETTINGS_PATHS = {
  company: "/einstellungen/firma",
  users: "/einstellungen/benutzer",
  legal: "/einstellungen/rechtliches",
} as const;

/** Heading, subtitle and sub-navigation shared by the three Einstellungen pages. */
export async function SettingsHeader({ actions }: { actions?: React.ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={actions} />
      <SettingsTabs
        label={t("tabsLabel")}
        tabs={(["company", "users", "legal"] as const).map((key) => ({
          key,
          href: SETTINGS_PATHS[key],
          label: t(`tabs.${key}`),
        }))}
      />
    </>
  );
}
