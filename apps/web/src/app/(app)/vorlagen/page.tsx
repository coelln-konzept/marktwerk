import { can } from "@marktwerk/core";
import { Eye, Layers, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PresetStatusBadge } from "@/components/catalogue/preset-status";
import { PresetVorschau } from "@/components/catalogue/preset-vorschau";
import { Page, PageHeader } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { RowActions, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { rruleText } from "@/lib/rrule-text";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { listPresets } from "@/server/queries/presets";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("templates") };
}

const PATH = "/vorlagen";

export default async function TemplatesPage({ searchParams }: PageProps<"/vorlagen">) {
  const user = await requirePermission("template", "read");
  const canWrite = can(user.role, "template", "write");
  const sp = await searchParams;
  const t = await getTranslations("templates");
  const locale = await getLocale();
  const presets = await listPresets();
  const vorschauId = param(sp.vorschau);
  const selected = presets.find((p) => p.id === vorschauId);
  const active = presets.filter((p) => p.active).length;

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { count: presets.length, active })}
        actions={
          canWrite && (
            <Link
              href={"/vorlagen/neu" as never}
              className={buttonVariants({ variant: "default" })}
            >
              <Plus aria-hidden />
              {t("new")}
            </Link>
          )
        }
      />

      <nav aria-label={t("tabsLabel")} className="-mb-2 flex gap-1 border-b">
        <Link
          href={PATH as never}
          aria-current="page"
          className="-mb-px inline-flex min-h-9 items-center border-primary border-b-2 px-3 font-semibold text-foreground"
        >
          {t("tabs.events")}
        </Link>
        <span
          aria-disabled="true"
          className="-mb-px inline-flex min-h-9 cursor-not-allowed items-center gap-2 border-transparent border-b-2 px-3 font-medium text-faint-foreground"
        >
          {t("tabs.timelines")}
          <span className="rounded-full bg-status-neutral-bg px-2 py-0.5 font-semibold text-status-neutral text-tiny">
            {t("tabs.soon")}
          </span>
        </span>
      </nav>

      <Panel className="overflow-hidden">
        {presets.length === 0 ? (
          <EmptyState icon={Layers} title={t("empty")} />
        ) : (
          <KeyboardRows>
            <Table>
              <caption className="sr-only">{t("caption")}</caption>
              <THead>
                <tr>
                  <TH>{t("cols.name")}</TH>
                  <TH>{t("cols.type")}</TH>
                  <TH>{t("cols.venue")}</TH>
                  <TH>{t("cols.rhythm")}</TH>
                  <TH>{t("cols.duration")}</TH>
                  <TH className="text-right">{t("cols.price")}</TH>
                  <TH className="text-right">{t("cols.fee")}</TH>
                  <TH>{t("cols.status")}</TH>
                  <TH>
                    <span className="sr-only">{t("cols.actions")}</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {presets.map((p) => {
                  const peek = hrefWith(PATH, sp, { vorschau: p.id });
                  return (
                    <TR
                      key={p.id}
                      tabIndex={0}
                      data-row
                      data-peek={peek}
                      aria-selected={vorschauId === p.id}
                      className={cn(
                        "outline-none focus-visible:bg-selected",
                        !p.active && "text-muted-foreground",
                      )}
                    >
                      <TD>
                        <Link
                          href={peek as never}
                          scroll={false}
                          tabIndex={-1}
                          className="whitespace-nowrap font-semibold text-accent-soft-foreground hover:underline"
                        >
                          {p.name}
                        </Link>
                      </TD>
                      <TD>
                        <EventTypeTag typeKey={p.typeKey}>
                          {locale === "en" ? p.typeNameEn : p.typeNameDe}
                        </EventTypeTag>
                      </TD>
                      <TD className="max-w-36 truncate" title={p.venueName}>
                        <Link
                          href={`/orte/${p.venueId}` as never}
                          tabIndex={-1}
                          className="hover:underline"
                        >
                          {p.venueName}
                        </Link>
                      </TD>
                      <TD className="max-w-60">{rruleText(p.rrule, locale)}</TD>
                      <TD className="tabular whitespace-nowrap">
                        {t("duration", { days: p.durationDays })}
                      </TD>
                      <TD className="tabular whitespace-nowrap text-right">
                        {t("perMeter", { price: formatMoney(p.pricePerMCents, locale) })}
                      </TD>
                      <TD className="tabular whitespace-nowrap text-right">
                        {formatMoney(p.bookingFeeCents, locale)}
                      </TD>
                      <TD>
                        <PresetStatusBadge active={p.active} />
                      </TD>
                      <TD className="w-20">
                        <RowActions>
                          <Link
                            href={peek as never}
                            scroll={false}
                            tabIndex={-1}
                            aria-label={t("preview", { name: p.name })}
                            className="grid size-7 place-items-center rounded-md hover:bg-hover"
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canWrite && (
                            <Link
                              href={`/vorlagen/${p.id}` as never}
                              tabIndex={-1}
                              aria-label={t("editLabel", { name: p.name })}
                              className="grid size-7 place-items-center rounded-md hover:bg-hover"
                            >
                              <Pencil className="size-4" />
                            </Link>
                          )}
                        </RowActions>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </KeyboardRows>
        )}
      </Panel>

      <p className="text-muted-foreground text-tiny">{t("keys")}</p>

      {selected && (
        <PresetVorschau
          preset={selected}
          closeHref={hrefWith(PATH, sp, { vorschau: undefined })}
          canEdit={canWrite}
        />
      )}
    </Page>
  );
}
