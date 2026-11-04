import { getTranslations } from "next-intl/server";
import { NewMailView } from "@/components/postfach/new-mail-view";
import { Page, PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { loadMailDemo } from "@/server/postfach/demo-mail";
import { requirePermission } from "@/server/session";

/** PROTOTYPE: new mail (`?an=`, `?veranstaltung=`, `?entwurf=`). */
export default async function NewMailPage({ searchParams }: PageProps<"/postfach/neu">) {
  await requirePermission("vendor", "read");
  const actor = await getActor();
  const t = await getTranslations("postfach");
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const { mail, plan } = await loadMailDemo(actor, todayIn());
  const an = str(sp.an);
  return (
    <Page crumbs={[{ label: t("title"), href: "/postfach" }, { label: t("nav.new") }]}>
      <PageHeader title={t("nav.new")} eyebrow={t("prototype")} />
      <NewMailView
        demo={mail}
        plan={plan}
        to={an ? [{ name: "", address: an }] : []}
        eventId={str(sp.veranstaltung)}
        draftId={str(sp.entwurf)}
      />
    </Page>
  );
}
