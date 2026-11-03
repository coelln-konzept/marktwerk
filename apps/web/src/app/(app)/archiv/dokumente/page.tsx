import { Hammer } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArchiveFrame } from "@/components/archive/archive-frame";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("archive"))("sections.documents") };
}

/** Archiv section that follows next (decision 2026-11-03); the tab already has its URL. */
export default async function ArchiveDocumentsPage() {
  await requireUser();
  const t = await getTranslations();
  return (
    <ArchiveFrame section="documents">
      <Panel>
        <EmptyState
          icon={Hammer}
          title={t("comingSoon.title")}
          hint={t("archive.soon.documents")}
        />
      </Panel>
    </ArchiveFrame>
  );
}
