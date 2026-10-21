import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/ui/coming-soon";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("finance") };
}

export default async function Placeholder() {
  await requirePermission("finance", "read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.finance")} milestone="M5" what={t("comingSoon.finance")} />;
}
