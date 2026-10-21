import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ObligationForm } from "@/components/company/obligation-form";
import { Page, PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import {
  getObligation,
  legalIntervals,
  listStaffOptions,
  listVehicleOptions,
} from "@/server/queries/company";
import { listVenueOptions } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/firma/pflichten/[id]/bearbeiten">): Promise<Metadata> {
  const found = await getObligation((await params).id, todayIn());
  return { title: found?.obligation.title ?? (await getTranslations("company.form"))("editTitle") };
}

export default async function EditObligationPage({
  params,
}: PageProps<"/firma/pflichten/[id]/bearbeiten">) {
  await requirePermission("company", "write");
  const { id } = await params;
  const today = todayIn();
  const found = await getObligation(id, today);
  if (!found || found.archived) notFound();
  const o = found.obligation;
  const t = await getTranslations("company");
  const tf = await getTranslations("company.form");
  const [vehicles, venues, staff, legal] = await Promise.all([
    listVehicleOptions(),
    listVenueOptions(),
    listStaffOptions(),
    legalIntervals(today),
  ]);
  // The responsible person may have left the active team since; keep them selectable so saving works.
  const responsibleListed = staff.some((s) => s.id === o.responsibleId);

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/firma" },
        { label: t("obligations.title"), href: "/firma/pflichten" },
        { label: o.title, href: `/firma/pflichten/${o.id}` },
        { label: tf("editTitle") },
      ]}
    >
      <PageHeader title={tf("editTitle")} subtitle={tf("editSubtitle")} />
      <ObligationForm
        obligationId={o.id}
        today={today}
        vehicles={vehicles}
        venues={venues}
        staff={
          responsibleListed ? staff : [...staff, { id: o.responsibleId, name: o.responsibleName }]
        }
        legal={legal}
        initial={{
          kind: o.kind,
          title: o.title,
          scope: o.scope,
          vehicleId: o.vehicleId,
          venueId: o.venueId,
          intervalMonths: o.intervalMonths,
          intervalKm: o.intervalKm,
          nextDueOn: o.nextDueOn,
          nextDueKm: o.nextDueKm,
          leadDays: o.leadDays,
          responsibleStaffMemberId: o.responsibleId,
          createsPayable: o.createsPayable,
          notes: o.notes,
        }}
      />
    </Page>
  );
}
