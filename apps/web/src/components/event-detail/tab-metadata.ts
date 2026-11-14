import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type TabKey = "board" | "permits" | "team" | "money" | "documents" | "notes" | "history";

/**
 * `generateMetadata` of an event tab's layout: the tab's name, which the event layout's title template
 * completes to "Checkliste · <Name> · <Datum> · marktwerk" (UX-039: every tab has its own browser title).
 * Only a label, so nothing is loaded and no permission is needed here; the pages check as usual.
 */
export function eventTabMetadata(key: TabKey) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("eventDetail.tabs");
    return { title: t(key) };
  };
}
