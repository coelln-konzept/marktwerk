import { eventTabMetadata } from "@/components/event-detail/tab-metadata";

export const generateMetadata = eventTabMetadata("history");

/** Only gives the tab its browser title ("Verlauf · …"). */
export default function EventHistoryTabLayout({
  children,
}: LayoutProps<"/veranstaltungen/[id]/verlauf">) {
  return children;
}
