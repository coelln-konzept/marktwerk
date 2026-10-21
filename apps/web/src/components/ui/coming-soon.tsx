import { Hammer } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { Panel } from "./panel";
import { EmptyState } from "./states";

/** Placeholder for modules that arrive in a later milestone, so the sidebar never leads nowhere. */
export async function ComingSoon({
  title,
  milestone,
  what,
}: {
  title: string;
  milestone: string;
  what: string;
}) {
  const t = await getTranslations("comingSoon");
  return (
    <Page crumbs={[{ label: title }]}>
      <PageHeader title={title} />
      <Panel>
        <EmptyState icon={Hammer} title={t("title", { milestone })} hint={what} />
      </Panel>
    </Page>
  );
}
