import { formatDate } from "@/lib/format";

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/**
 * A permit title for people. Permits of single events are named "Halteverbot – 2027-05-01" (the date is
 * part of the stored name, see `permitTitle` in the permits service); the raw ISO date is shown in the
 * locale's format ("01.05.2027") wherever the title is displayed.
 */
export function formatPermitTitle(title: string, locale: string): string {
  return title.replace(ISO_DATE, (iso) => {
    try {
      return formatDate(iso, locale);
    } catch {
      return iso; // not a real date ("2027-13-45"): leave the text alone
    }
  });
}
