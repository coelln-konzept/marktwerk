import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MailSettings } from "@/components/postfach/mail-settings";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Page } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import { isModuleHidden } from "@/lib/modules";
import { getActor } from "@/server/actor";
import { loadMailDemo } from "@/server/postfach/demo-mail";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("tabs.mail")} · ${t("title")}` };
}

/** PROTOTYPE: mail templates and mailbox signatures (stored in the browser). */
export default async function MailSettingsPage() {
  await requirePermission("settings", "read");
  if (isModuleHidden("standplanPrototype")) notFound();
  const [t, actor] = await Promise.all([getTranslations("settings"), getActor()]);
  const { mail } = await loadMailDemo(actor, todayIn());
  return (
    <Page crumbs={[{ label: t("title"), href: "/einstellungen" }, { label: t("tabs.mail") }]}>
      <SettingsHeader />
      <MailSettings demo={mail} />
    </Page>
  );
}
