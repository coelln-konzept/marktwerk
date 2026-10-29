import { formatDate } from "@/lib/format";

/**
 * Permit names often carry the day they were made for ("Halteverbot – 2027-04-04"). The raw ISO date is shown
 * the way the app writes dates everywhere else.
 */
export function permitTitle(title: string, locale: string): string {
  return title.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => formatDate(iso, locale));
}
