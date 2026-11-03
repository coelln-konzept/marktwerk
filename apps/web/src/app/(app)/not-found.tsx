import { SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";

/** Unknown record or route inside the app (e.g. a deleted event, a mistyped link). */
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <Page crumbs={[{ label: t("notFoundTitle") }]}>
      {/* React hoists <title> into <head>; the tab no longer shows the bare URL. */}
      <title>{`${t("notFoundTitle")} · marktwerk`}</title>
      <PageHeader title={t("notFoundTitle")} />
      <Panel>
        {/* The explanation comes first, then the way out. */}
        <EmptyState icon={SearchX} title={t("notFoundHint")}>
          <Link
            href="/"
            className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
          >
            {t("back")}
          </Link>
        </EmptyState>
      </Panel>
    </Page>
  );
}
