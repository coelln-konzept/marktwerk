import { eventTabMetadata } from "@/components/event-detail/tab-metadata";

export const generateMetadata = eventTabMetadata("documents");

/** Only gives the tab its browser title ("Dokumente · …"). */
export default function EventDocumentsTabLayout({
  children,
}: LayoutProps<"/veranstaltungen/[id]/dokumente">) {
  return children;
}
