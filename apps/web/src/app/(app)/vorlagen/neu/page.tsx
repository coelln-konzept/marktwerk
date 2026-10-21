import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PresetForm } from "@/components/presets/preset-form";
import { Page, PageHeader } from "@/components/shell/page";
import { getPresetFormOptions } from "@/server/queries/presets";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("templates.form"))("newTitle") };
}

/** Usual market day, until somebody types their own (open decision: no fixed company default yet). */
const DEFAULT_TIMES = { setup: "06:00", open: "08:00", close: "16:00", teardown: "18:00" };

/** "Neue Vorlage": prices start at the event type's defaults. */
export default async function NewPresetPage() {
  await requirePermission("template", "write");
  const t = await getTranslations("templates");
  const options = await getPresetFormOptions();
  const type = options.types[0];

  return (
    <Page crumbs={[{ label: t("title"), href: "/vorlagen" }, { label: t("form.newTitle") }]}>
      <PageHeader
        title={t("form.newTitle")}
        subtitle={t("form.newSubtitle")}
        eyebrow={
          <Link href={"/vorlagen" as never} className="hover:underline">
            {t("form.back")}
          </Link>
        }
      />
      <PresetForm
        options={options}
        initial={{
          name: "",
          eventTypeId: type?.id ?? "",
          venueId: "",
          durationDays: 1,
          publicTitle: null,
          publicText: null,
          times: DEFAULT_TIMES,
          pricePerMCents: type?.defaultPricePerMCents ?? 0,
          bookingFeeCents: type?.defaultBookingFeeCents ?? 0,
          rrule: null,
          defaultDuties: {},
          active: true,
        }}
      />
    </Page>
  );
}
