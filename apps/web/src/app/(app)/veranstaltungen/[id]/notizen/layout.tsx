import { eventTabMetadata } from "@/components/event-detail/tab-metadata";

export const generateMetadata = eventTabMetadata("notes");

/** Only gives the tab its browser title ("Notizen · …"). */
export default function EventNotesTabLayout({
  children,
}: LayoutProps<"/veranstaltungen/[id]/notizen">) {
  return children;
}
