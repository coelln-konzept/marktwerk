import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/upload";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { getActor } from "@/server/actor";
import { canWriteDocuments, listLinkedDocuments } from "@/server/queries/documents";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/** What gets filed under an event: notices (Genehmigung), plans and photos, contracts, anything else. */
const EVENT_DOCUMENT_KINDS = ["other", "permit", "contract", "photo"] as const;

/** Tab "Dokumente": notices, plans and contracts of the event (`document.event_id`). */
export default async function EventDocumentsPage({
  params,
}: PageProps<"/veranstaltungen/[id]/dokumente">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const t = await getTranslations("eventDetail.documents");
  const documents = (await listLinkedDocuments(actor, "eventId", [event.id])).get(event.id) ?? [];
  const canWrite = canWriteDocuments(actor, "eventId");
  return (
    <Panel aria-labelledby="documents-title">
      <PanelHeader>
        <PanelTitle id="documents-title">{t("title")}</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        {documents.length === 0 ? (
          <p className="m-0 text-muted-foreground">{t("empty")}</p>
        ) : (
          <DocumentList documents={documents} canWrite={canWrite} />
        )}
        {canWrite && (
          <DocumentUpload
            link={{ eventId: event.id }}
            kinds={EVENT_DOCUMENT_KINDS}
            kindLabel={t("kind")}
            label={t("add")}
          />
        )}
        {!canWrite && <p className="m-0 text-faint-foreground text-small">{t("readOnly")}</p>}
      </PanelBody>
    </Panel>
  );
}
