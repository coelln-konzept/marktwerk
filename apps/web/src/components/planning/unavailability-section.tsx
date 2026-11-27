import { addDays } from "@marktwerk/core";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateRange } from "@/lib/format";
import { listUnavailabilityRanges } from "@/server/queries/planning";
import { AddUnavailabilityButton, RemoveUnavailabilityButton } from "./unavailability-controls";

/** Days ahead the person's Vorschau lists. */
const HORIZON_DAYS = 90;

/**
 * "Nicht verfügbar" in the person's Vorschau (team:manage): the next 90 days as ranges with their note,
 * each one removable with undo, and "Hinzufügen" for a new range.
 */
export async function UnavailabilitySection({
  staffMemberId,
  name,
  today,
}: {
  staffMemberId: string;
  name: string;
  today: string;
}) {
  const [t, locale, ranges] = await Promise.all([
    getTranslations("planning.unavailability"),
    getLocale(),
    listUnavailabilityRanges(staffMemberId, today, addDays(today, HORIZON_DAYS)),
  ]);
  return (
    <section aria-labelledby="pv-unavailability" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="pv-unavailability" className="font-semibold text-muted-foreground text-tiny">
          {t("title")}
        </h3>
        <AddUnavailabilityButton staffMemberId={staffMemberId} today={today} />
      </div>
      {ranges.length === 0 ? (
        <p className="m-0 text-faint-foreground">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {ranges.map((range) => {
            const label = formatDateRange(range.from, range.to, locale);
            return (
              <li key={range.from} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="tabular">{label}</span>
                  {range.note && (
                    <span className="block text-muted-foreground text-tiny">{range.note}</span>
                  )}
                </span>
                <RemoveUnavailabilityButton
                  staffMemberId={staffMemberId}
                  name={name}
                  range={range}
                  label={label}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
