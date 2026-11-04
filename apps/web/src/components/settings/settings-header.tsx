import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page";
import { isModuleVisible } from "@/lib/modules";
import { SettingsTabs } from "./settings-tabs";

export const SETTINGS_PATHS = {
  company: "/einstellungen/firma",
  users: "/einstellungen/benutzer",
  legal: "/einstellungen/rechtliches",
  library: "/einstellungen/bibliothek",
  /** PROTOTYPE (exp/stand-allocation): mail templates and signatures of the Postfach. */
  mail: "/einstellungen/mail",
} as const;

/**
 * Heading, subtitle and sub-navigation shared by the Einstellungen pages. "Rechtliche Werte" (minimum
 * wage, Minijob limit, hours) only matter with Team, so the tab waits for it (`lib/modules.ts`).
 */
export async function SettingsHeader({ actions }: { actions?: React.ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t(isModuleVisible("team") ? "subtitleWithLegal" : "subtitle")}
        actions={actions}
      />
      <SettingsTabs
        label={t("tabsLabel")}
        tabs={(["company", "users", "legal", "library", "mail"] as const)
          .filter((key) => key !== "legal" || isModuleVisible("team"))
          .filter((key) => key !== "mail" || isModuleVisible("standplanPrototype"))
          .map((key) => ({
            key,
            href: SETTINGS_PATHS[key],
            label: t(`tabs.${key}`),
          }))}
      />
    </>
  );
}
