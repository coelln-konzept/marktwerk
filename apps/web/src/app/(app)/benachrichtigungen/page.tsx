import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/ui/coming-soon";
import { requireUser } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("notifications") };
}

export default async function Placeholder() {
  await requireUser();
  const t = await getTranslations();
  return (
    <ComingSoon
      title={t("nav.notifications")}
      milestone="M3"
      what={t("comingSoon.notifications")}
    />
  );
}
