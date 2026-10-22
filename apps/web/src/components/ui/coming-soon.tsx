import { Hammer } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { Panel } from "./panel";
import { EmptyState } from "./states";

/** Placeholder for modules that arrive later, so the sidebar never leads nowhere. */
export async function ComingSoon({ title, what }: { title: string; what: string }) {
  const t = await getTranslations("comingSoon");
  return (
    <Page crumbs={[{ label: title }]}>
      <PageHeader title={title} />
      <Panel>
        <EmptyState icon={Hammer} title={t("title")} hint={what} />
      </Panel>
    </Page>
  );
}
