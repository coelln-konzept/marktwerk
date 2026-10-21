import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { RequirementForm } from "@/components/permits/requirement-form";
import { Page, PageHeader } from "@/components/shell/page";
import { listContactOptions } from "@/server/queries/contacts";
import { listEventTypes } from "@/server/queries/events";
import { getRequirement } from "@/server/queries/permits";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("requirements.form"))("titleEdit") };
}

/** "Anforderung bearbeiten". */
export default async function EditRequirementPage({
  params,
}: PageProps<"/orte/[id]/genehmigungen/[reqId]">) {
  await requirePermission("permit", "write");
  const { id, reqId } = await params;
  const found = await getRequirement(reqId);
  if (!found || found.requirement.venueId !== id) notFound();
  const { requirement, venueName } = found;
  const t = await getTranslations("requirements.form");
  const tVenues = await getTranslations("venues");
  const locale = await getLocale();
  const [contacts, types] = await Promise.all([listContactOptions(), listEventTypes()]);
  return (
    <Page
      crumbs={[
        { label: tVenues("title"), href: "/orte" },
        { label: venueName, href: `/orte/${id}` },
        { label: t("titleEdit") },
      ]}
    >
      <PageHeader title={requirement.title} subtitle={t("subtitle", { venue: venueName })} />
      <RequirementForm
        venueId={id}
        requirementId={requirement.id}
        initial={{
          category: requirement.category,
          permitType: requirement.permitType,
          title: requirement.title,
          eventTypeId: requirement.eventTypeId,
          authorityContactId: requirement.authorityContactId,
          cadence: requirement.cadence,
          leadTimeDays: requirement.leadTimeDays,
          submissionWindowStartMd: requirement.submissionWindowStartMd,
          submissionWindowEndMd: requirement.submissionWindowEndMd,
          expectedDecisionMd: requirement.expectedDecisionMd,
          typicalFeeCents: requirement.typicalFeeCents,
          deliverables: requirement.deliverables,
          notes: requirement.notes,
        }}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
        eventTypes={types.map((x) => ({ id: x.id, name: locale === "en" ? x.nameEn : x.nameDe }))}
      />
    </Page>
  );
}
