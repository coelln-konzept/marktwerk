import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EMPTY_VEHICLE, VehicleForm } from "@/components/company/vehicle-form";
import { Page, PageHeader } from "@/components/shell/page";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("company.vehicleForm"))("newTitle") };
}

export default async function NewVehiclePage() {
  await requirePermission("company", "write");
  const t = await getTranslations("company");
  const tf = await getTranslations("company.vehicleForm");

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/firma" },
        { label: t("vehicles.title"), href: "/firma/fahrzeuge" },
        { label: tf("newTitle") },
      ]}
    >
      <PageHeader title={tf("newTitle")} subtitle={tf("newSubtitle")} />
      <VehicleForm initial={EMPTY_VEHICLE} />
    </Page>
  );
}
