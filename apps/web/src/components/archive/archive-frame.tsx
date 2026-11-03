import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { SegmentedLinks } from "@/components/ui/segmented-links";

export const ARCHIVE_SECTIONS = ["events", "documents", "activity", "permits"] as const;
export type ArchiveSection = (typeof ARCHIVE_SECTIONS)[number];

/** Each section has its own URL under `/archiv` (classic screens, ADR 0019). */
export const ARCHIVE_PATHS: Record<ArchiveSection, string> = {
  events: "/archiv/veranstaltungen",
  documents: "/archiv/dokumente",
  activity: "/archiv/aktivitaet",
  permits: "/archiv/genehmigungen",
};

/**
 * The Archiv (decision 2026-11-03): everything past in one place, one section per URL. Vergangene
 * Veranstaltungen comes first (with "Als Vorlage speichern"); Dokumente, Aktivität and Alte Genehmigungen follow.
 */
export async function ArchiveFrame({
  section,
  actions,
  children,
}: {
  section: ArchiveSection;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = await getTranslations("archive");
  return (
    <Page
      crumbs={[
        { label: t("title"), href: ARCHIVE_PATHS.events },
        { label: t(`sections.${section}`) },
      ]}
    >
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={actions} />
      <SegmentedLinks
        label={t("sections.label")}
        items={ARCHIVE_SECTIONS.map((key) => ({
          key,
          label: t(`sections.${key}`),
          href: ARCHIVE_PATHS[key],
          active: key === section,
        }))}
      />
      {children}
    </Page>
  );
}
