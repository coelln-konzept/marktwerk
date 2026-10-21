import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate, formatNumber } from "@/lib/format";

/** "alle 24 Monate" / "alle 30.000 km" / both / "einmalig". */
export async function IntervalText({ months, km }: { months: number | null; km: number | null }) {
  const t = await getTranslations("company.interval");
  const locale = await getLocale();
  if (months !== null && km !== null) return t("both", { months, km: formatNumber(km, locale, 0) });
  if (months !== null) return t("months", { months });
  if (km !== null) return t("km", { km: formatNumber(km, locale, 0) });
  return t("none");
}

/** Next due date and/or km, one per line. */
export async function DueCell({ dueOn, dueKm }: { dueOn: string | null; dueKm: number | null }) {
  const t = await getTranslations("company");
  const locale = await getLocale();
  if (dueOn === null && dueKm === null)
    return <span className="text-faint-foreground">{t("none")}</span>;
  return (
    <span className="tabular flex flex-col whitespace-nowrap">
      {dueOn && <span className="font-medium">{formatDate(dueOn, locale)}</span>}
      {dueKm !== null && (
        <span className={dueOn ? "text-muted-foreground text-small" : "font-medium"}>
          {t("obligations.dueKm", { km: formatNumber(dueKm, locale, 0) })}
        </span>
      )}
    </span>
  );
}

/** Where an obligation applies: the vehicle (linked), the venue (linked) or the company. */
export async function TargetCell({
  scope,
  vehicleId,
  vehicleName,
  vehiclePlate,
  venueId,
  venueName,
}: {
  scope: "company" | "vehicle" | "venue";
  vehicleId: string | null;
  vehicleName: string | null;
  vehiclePlate: string | null;
  venueId: string | null;
  venueName: string | null;
}) {
  const t = await getTranslations("company.scopes");
  if (scope === "vehicle" && vehicleId)
    return (
      <Link
        href={`/firma/fahrzeuge/${vehicleId}` as never}
        className="hover:underline"
        title={vehicleName ?? undefined}
      >
        {vehicleName}
        <span className="tabular ml-1.5 text-muted-foreground text-small">{vehiclePlate}</span>
      </Link>
    );
  if (scope === "venue" && venueId)
    return (
      <Link href={`/orte/${venueId}` as never} className="hover:underline">
        {venueName}
      </Link>
    );
  return <span>{t("company")}</span>;
}
