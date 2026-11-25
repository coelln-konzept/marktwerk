import { eventTabMetadata } from "@/components/event-detail/tab-metadata";

export const generateMetadata = eventTabMetadata("board");

/** Only gives the tab its browser title ("Checkliste · …"). */
export default function EventBoardTabLayout({
  children,
}: LayoutProps<"/veranstaltungen/[id]/board">) {
  return children;
}
