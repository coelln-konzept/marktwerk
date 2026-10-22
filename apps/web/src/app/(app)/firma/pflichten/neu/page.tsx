import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ObligationForm } from "@/components/company/obligation-form";
import { Page, PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import { param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  isUuid,
  legalIntervals,
  listStaffOptions,
  listVehicleOptions,
} from "@/server/queries/company";
import { listVenueOptions } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("company.form"))("newTitle") };
}

export default async function NewObligationPage({
  searchParams,
}: PageProps<"/firma/pflichten/neu">) {
  await requirePermission("company", "write");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("company");
  const tf = await getTranslations("company.form");
  const today = todayIn();
  const [vehicles, venues, staff, legal] = await Promise.all([
    listVehicleOptions(),
    listVenueOptions(),
    listStaffOptions(),
    legalIntervals(today),
  ]);
  // "Pflicht anlegen" on a vehicle's page passes the vehicle along.
  const vehicleParam = param(sp.fahrzeug);
  const vehicleId = vehicleParam && isUuid(vehicleParam) ? vehicleParam : null;
  const preselected = vehicles.find((v) => v.id === vehicleId);

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/firma" },
        { label: t("obligations.title"), href: "/firma/pflichten" },
        { label: tf("newTitle") },
      ]}
    >
      <PageHeader title={tf("newTitle")} subtitle={tf("newSubtitle")} />
      <ObligationForm
        today={today}
        vehicles={vehicles}
        venues={venues}
        staff={staff}
        legal={legal}
        initial={{
          kind: "other",
          title: "",
          scope: preselected ? "vehicle" : "company",
          vehicleId: preselected?.id ?? null,
          venueId: null,
          intervalMonths: null,
          intervalKm: null,
          nextDueOn: null,
          nextDueKm: null,
          leadDays: 14,
          // The signed-in person if they are on the team, otherwise the person picks.
          responsibleStaffMemberId: actor.staffMemberId ?? "",
          createsPayable: false,
          notes: null,
        }}
      />
    </Page>
  );
}
