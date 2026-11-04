import { getTranslations } from "next-intl/server";
import { PostfachView } from "@/components/postfach/postfach-view";
import { Page, PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { loadMailDemo } from "@/server/postfach/demo-mail";
import { requirePermission } from "@/server/session";

/** PROTOTYPE: light mail browser for the shared mailboxes (spec 2026-11-04, demo data, browser storage). */
export default async function PostfachPage({ searchParams }: PageProps<"/postfach">) {
  await requirePermission("vendor", "read");
  const actor = await getActor();
  const t = await getTranslations("postfach");
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const { mail, plan } = await loadMailDemo(actor, todayIn());
  return (
    <Page crumbs={[{ label: t("title") }]} wide>
      <PageHeader title={t("title")} subtitle={t("subtitle")} eyebrow={t("prototype")} />
      <PostfachView
        demo={mail}
        plan={plan}
        initial={{
          postfach: str(sp.postfach),
          ordner: str(sp.ordner),
          status: str(sp.status),
          konv: str(sp.konv) ?? (str(sp.mail) ? `c-${str(sp.mail)}` : null),
          q: str(sp.q),
          mir: str(sp.mir) === "1",
        }}
      />
    </Page>
  );
}
