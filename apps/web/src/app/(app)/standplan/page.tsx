import { can } from "@marktwerk/core";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { StandplanView } from "@/components/standplan/standplan-view";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { requirePermission } from "@/server/session";
import { loadStandplanDemo } from "@/server/standplan/demo-data";

/**
 * PROTOTYPE (branch exp/stand-allocation): stall allocation per event. Requests from the Postfach are
 * dragged onto rows; Autoplatz proposes, a person confirms and the vendor gets a confirmation mail.
 * Data is read-only from Postgres; placements live in the browser until the booking tables exist.
 */
export default async function StandplanPage({ searchParams }: PageProps<"/standplan">) {
  await requirePermission("vendor", "read");
  const actor = await getActor();
  const t = await getTranslations("standplan");
  const sp = await searchParams;
  const { data } = await loadStandplanDemo(actor, todayIn());
  const initial = typeof sp.veranstaltung === "string" ? sp.veranstaltung : null;
  return (
    <Page crumbs={[{ label: t("title") }]} wide>
      <PageHeader title={t("title")} subtitle={t("subtitle")} eyebrow={t("prototype")} />
      <StandplanView
        data={data}
        initialEventId={initial}
        canWrite={can(actor.role, "vendor", "write")}
      />
    </Page>
  );
}
