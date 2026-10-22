import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PresetStatusBadge } from "@/components/catalogue/preset-status";
import { PresetForm } from "@/components/presets/preset-form";
import { Page, PageHeader } from "@/components/shell/page";
import { getPresetForEdit, getPresetFormOptions } from "@/server/queries/presets";
import { requirePermission } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/vorlagen/[id]">): Promise<Metadata> {
  const preset = await getPresetForEdit((await params).id);
  return { title: preset?.name ?? (await getTranslations("settings"))("tabs.library") };
}

/** "Vorlage bearbeiten" (template:write). Changes only apply to events generated afterwards. */
export default async function EditPresetPage({ params }: PageProps<"/vorlagen/[id]">) {
  await requirePermission("template", "write");
  const { id } = await params;
  const preset = await getPresetForEdit(id);
  if (!preset) notFound();
  const t = await getTranslations("templates");
  const tLib = await getTranslations("settings");
  const tNav = await getTranslations("nav");
  const options = await getPresetFormOptions({
    eventTypeId: preset.eventTypeId,
    venueId: preset.venueId,
    staffIds: Object.values(preset.defaultDuties),
  });
  // Only roles that exist are editable; a leftover key of a removed role is dropped on the next save.
  const roleKeys = new Set(options.roles.map((r) => r.key));
  const defaultDuties = Object.fromEntries(
    Object.entries(preset.defaultDuties).filter(([key]) => roleKeys.has(key)),
  );

  return (
    <Page
      crumbs={[
        { label: tNav("settings"), href: "/einstellungen/firma" },
        { label: tLib("tabs.library"), href: "/einstellungen/bibliothek" },
        { label: preset.name, href: `/einstellungen/bibliothek?vorschau=${preset.id}` },
        { label: t("form.editCrumb") },
      ]}
    >
      <PageHeader
        title={t("form.editTitle")}
        subtitle={preset.name}
        eyebrow={
          <Link
            href={`/einstellungen/bibliothek?vorschau=${preset.id}` as never}
            className="hover:underline"
          >
            {t("form.back")}
          </Link>
        }
        actions={<PresetStatusBadge active={preset.active} />}
      />
      <PresetForm
        options={options}
        edit={{ id: preset.id, updatedAt: preset.updatedAt.toISOString() }}
        initial={{
          name: preset.name,
          eventTypeId: preset.eventTypeId,
          venueId: preset.venueId,
          durationDays: preset.durationDays,
          publicTitle: preset.publicTitle,
          publicText: preset.publicText,
          times: preset.defaultTimes,
          pricePerMCents: preset.pricePerMCents,
          bookingFeeCents: preset.bookingFeeCents,
          rrule: preset.rrule,
          defaultDuties,
          active: preset.active,
          color: preset.color,
        }}
      />
    </Page>
  );
}
