import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { PostfachView } from "@/components/standplan/postfach-view";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { requirePermission } from "@/server/session";
import { loadStandplanDemo } from "@/server/standplan/demo-data";

/** PROTOTYPE: the shared mailbox with recognised stall requests (demo mails built from dev data). */
export default async function PostfachPage({ searchParams }: PageProps<"/postfach">) {
  await requirePermission("vendor", "read");
  const actor = await getActor();
  const t = await getTranslations("postfach");
  const sp = await searchParams;
  const { mails, data } = await loadStandplanDemo(actor, todayIn());
  return (
    <Page crumbs={[{ label: t("title") }]} wide>
      <PageHeader title={t("title")} subtitle={t("subtitle")} eyebrow={t("prototype")} />
      <PostfachView
        mails={mails}
        data={data}
        initialFolder={typeof sp.ordner === "string" ? sp.ordner : null}
        initialMailId={typeof sp.mail === "string" ? sp.mail : null}
      />
    </Page>
  );
}
