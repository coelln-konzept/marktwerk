import { Check, Minus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { formatDate, formatLength } from "@/lib/format";
import { getVendor } from "@/server/queries/vendors";
import { TagList } from "./duty-tags";
import { PhoneLink } from "./phone";

/** Vorschau of one vendor: every field, read only (Phase 1 import). */
export async function VendorVorschau({ id, closeHref }: { id: string; closeHref: string }) {
  const v = await getVendor(id);
  if (!v) return null;
  const [t, tCat, locale] = await Promise.all([
    getTranslations("vendors.vorschau"),
    getTranslations("vendors.category"),
    getLocale(),
  ]);
  const tv = await getTranslations("vendors");
  const none = <span className="text-faint-foreground">{tv("noValue")}</span>;
  const address = [v.street, [v.postalCode, v.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return (
    <Vorschau
      kind={t("kind")}
      title={v.displayName}
      closeHref={closeHref}
      badges={
        v.legacyId !== null ? (
          <span className="tabular text-muted-foreground text-tiny">
            {t("legacyId", { id: v.legacyId })}
          </span>
        ) : undefined
      }
    >
      <Facts
        items={[
          { label: t("type"), value: tv(`kind.${v.kind}`) },
          { label: t("company"), value: v.companyName || none },
          { label: t("address"), value: address || none },
          { label: t("phone"), value: <PhoneLink phone={v.phoneE164} fallback={tv("noValue")} /> },
          {
            label: t("email"),
            value: v.email ? (
              <a href={`mailto:${v.email}`} className="break-all hover:underline">
                {v.email}
              </a>
            ) : (
              none
            ),
          },
          {
            label: t("categories"),
            value: (
              <TagList items={v.categories.map((c) => tCat(c as never))} empty={tv("noValue")} />
            ),
          },
          {
            label: t("defaultLength"),
            value: v.defaultLengthCm ? (
              <span className="tabular">{formatLength(v.defaultLengthCm, locale)}</span>
            ) : (
              none
            ),
          },
          {
            label: t("car"),
            value: v.hasCar ? (
              <span className="inline-flex items-center gap-1">
                <Check aria-hidden className="size-4 text-status-ok" />
                <span className="tabular">
                  {v.carLengthCm
                    ? tv("carYes", { length: formatLength(v.carLengthCm, locale) })
                    : tv("carYesNoLength")}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Minus aria-hidden className="size-4" />
                {tv("carNo")}
              </span>
            ),
          },
          {
            label: t("regular"),
            value: v.isRegular ? (
              <span className="inline-flex items-center gap-1">
                <Check aria-hidden className="size-4 text-status-ok" />
                {v.regularSpot ? `${tv("regularBadge")} · ${v.regularSpot}` : tv("regularBadge")}
              </span>
            ) : (
              none
            ),
          },
          {
            label: t("newsletter"),
            value: v.newsletterConsent
              ? tv(`consent.${v.newsletterConsent}` as never)
              : tv("consent.none"),
          },
          {
            label: t("since"),
            value: v.createdOn ? (
              <span className="tabular">{formatDate(v.createdOn, locale)}</span>
            ) : (
              none
            ),
          },
        ]}
      />
      <section aria-labelledby="vv-notes">
        <h3 id="vv-notes" className="mb-1 font-semibold text-muted-foreground text-tiny">
          {t("notes")}
        </h3>
        <p className="m-0 whitespace-pre-line">
          {v.notes || <span className="text-faint-foreground">{t("noNotes")}</span>}
        </p>
      </section>
      <p className="m-0 border-border-subtle border-t pt-2 text-muted-foreground text-tiny">
        {t("readOnly")}
      </p>
    </Vorschau>
  );
}
