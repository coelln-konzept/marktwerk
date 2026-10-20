import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Übersicht" };

export default async function OverviewPage() {
  const user = await requireUser();
  const t = await getTranslations("overview");
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("greeting", { name: user.name })}
      </h1>
      <p className="max-w-prose text-muted-foreground">{t("placeholder")}</p>
    </div>
  );
}
