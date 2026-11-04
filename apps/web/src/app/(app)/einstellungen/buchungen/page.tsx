import { can } from "@marktwerk/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Page } from "@/components/shell/page";
import { BookingSettingsForm } from "@/components/standplan/booking-settings";
import { isModuleHidden } from "@/lib/modules";
import { getActor } from "@/server/actor";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("tabs.bookings")} · ${t("title")}` };
}

/** PROTOTYPE: payment deadline, reminder timing and bank details of the two-step booking (browser only). */
export default async function BookingSettingsPage() {
  await requirePermission("settings", "read");
  if (isModuleHidden("standplanPrototype")) notFound();
  const [t, actor] = await Promise.all([getTranslations("settings"), getActor()]);
  return (
    <Page crumbs={[{ label: t("title"), href: "/einstellungen" }, { label: t("tabs.bookings") }]}>
      <SettingsHeader />
      <BookingSettingsForm canWrite={can(actor.role, "settings", "manage")} />
    </Page>
  );
}
