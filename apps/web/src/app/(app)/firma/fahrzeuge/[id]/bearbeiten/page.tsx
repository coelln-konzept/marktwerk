import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { VehicleForm } from "@/components/company/vehicle-form";
import { Page, PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import { getVehicle } from "@/server/queries/company";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/firma/fahrzeuge/[id]/bearbeiten">): Promise<Metadata> {
  const found = await getVehicle((await params).id, todayIn());
  return {
    title: found?.vehicle.name ?? (await getTranslations("company.vehicleForm"))("editTitle"),
  };
}

export default async function EditVehiclePage({
  params,
}: PageProps<"/firma/fahrzeuge/[id]/bearbeiten">) {
  await requirePermission("company", "write");
  const { id } = await params;
  const found = await getVehicle(id, todayIn());
  if (!found || found.vehicle.archivedAt) notFound();
  const v = found.vehicle;
  const t = await getTranslations("company");
  const tf = await getTranslations("company.vehicleForm");

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/firma" },
        { label: t("vehicles.title"), href: "/firma/fahrzeuge" },
        { label: v.name, href: `/firma/fahrzeuge/${v.id}` },
        { label: tf("editTitle") },
      ]}
    >
      <PageHeader title={tf("editTitle")} subtitle={tf("editSubtitle")} />
      <VehicleForm
        vehicleId={v.id}
        initial={{
          name: v.name,
          plate: v.plate,
          make: v.make,
          model: v.model,
          vin: v.vin,
          firstRegistrationOn: v.firstRegistrationOn,
          grossWeightKg: v.grossWeightKg,
          odometerKm: v.odometerKm,
          odometerRecordedOn: v.odometerRecordedOn,
          insurer: v.insurer,
          policyNumber: v.policyNumber,
          notes: v.notes,
        }}
      />
    </Page>
  );
}
