import { getTranslations } from "next-intl/server";
import { apiActor, forbiddenResponse, isForbiddenError } from "@/server/api";
import {
  type BundleLabels,
  buildReceiptBundle,
  MONTH_PATTERN,
} from "@/server/services/receipt-bundle";
import { zipStream } from "@/server/zip";

/**
 * Monthly bundle for the tax advisor: a zip with `belege.csv` (one row per payment, "Beleg fehlt"
 * flagged) and the receipt files named `YYYY-MM-DD_Lieferant_Betrag_Veranstaltung.ext`.
 * `?format=csv` returns only the list. Always German: it is read by the tax advisor.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/finanzen/belege/[monat]">,
) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { monat } = await params;
  if (!MONTH_PATTERN.test(monat)) return Response.json({ error: "invalid_month" }, { status: 400 });

  const t = await getTranslations({ locale: "de", namespace: "finance.bundle" });
  const tCategory = await getTranslations({ locale: "de", namespace: "finance.categories" });
  const tMethod = await getTranslations({ locale: "de", namespace: "finance.methods" });
  const labels: BundleLabels = {
    header: [
      t("cols.date"),
      t("cols.type"),
      t("cols.supplier"),
      t("cols.description"),
      t("cols.category"),
      t("cols.event"),
      t("cols.amount"),
      t("cols.method"),
      t("cols.reference"),
      t("cols.receipt"),
      t("cols.missing"),
    ],
    type: { installment: t("type.installment"), expense: t("type.expense") },
    yes: t("yes"),
    no: t("no"),
    category: (key) => (tCategory.has(key as never) ? tCategory(key as never) : key),
    method: (key) => (tMethod.has(key as never) ? tMethod(key as never) : key),
    folder: t("folder"),
    csvName: t("csvName", { month: monat }),
  };

  try {
    const bundle = await buildReceiptBundle(actor, monat, labels);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      return new Response(bundle.csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(labels.csvName)}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return new Response(zipStream(bundle.entries), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(t("zipName", { month: monat }))}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isForbiddenError(error)) return forbiddenResponse();
    throw error;
  }
}
