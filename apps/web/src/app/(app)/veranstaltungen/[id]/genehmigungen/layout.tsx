import { eventTabMetadata } from "@/components/event-detail/tab-metadata";

export const generateMetadata = eventTabMetadata("permits");

/** Only gives the tab its browser title ("Genehmigungen · …"). */
export default function EventPermitsTabLayout({
  children,
}: LayoutProps<"/veranstaltungen/[id]/genehmigungen">) {
  return children;
}
