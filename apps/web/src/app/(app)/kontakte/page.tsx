import { can } from "@marktwerk/core";
import { Eye, Pencil, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContactVorschau } from "@/components/catalogue/contact-vorschau";
import { ContactKindBadge } from "@/components/catalogue/kinds";
import { Page, PageHeader } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { MailLink, PhoneLink } from "@/components/ui/phone";
import { EmptyState } from "@/components/ui/states";
import { RowActions, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { CONTACT_KINDS, isContactKind, listContacts } from "@/server/queries/contacts";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("contacts") };
}

const PATH = "/kontakte";

export default async function ContactsPage({ searchParams }: PageProps<"/kontakte">) {
  await requirePermission("contact", "read");
  const actor = await getActor();
  const canWrite = can(actor.role, "contact", "write");
  const sp = await searchParams;
  const t = await getTranslations("contacts");
  const q = param(sp.q)?.slice(0, 100);
  const kindParam = param(sp.art);
  const kind = isContactKind(kindParam) ? kindParam : undefined;
  const vorschauId = param(sp.vorschau);
  const { rows, counts, total } = await listContacts(q, kind);

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { count: total })}
        actions={
          canWrite && (
            <Link
              href={"/kontakte/neu" as never}
              className={buttonVariants({ variant: "default" })}
            >
              <Plus aria-hidden />
              {t("new")}
            </Link>
          )
        }
      />

      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        {kind && <input type="hidden" name="art" value={kind} />}
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("search")}
          className="min-h-(--control-h) w-72 max-w-full rounded-lg border border-input bg-card px-3"
        />
      </form>

      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("kindsLabel")}>
        <FilterChip
          href={hrefWith(PATH, sp, { art: undefined, vorschau: undefined })}
          active={!kind}
          count={total}
        >
          {t("all")}
        </FilterChip>
        {CONTACT_KINDS.map((k) => (
          <FilterChip
            key={k}
            href={hrefWith(PATH, sp, { art: k, vorschau: undefined })}
            active={kind === k}
            count={counts[k] ?? 0}
          >
            {t(`kinds.${k}`)}
          </FilterChip>
        ))}
      </div>

      <Panel className="overflow-hidden">
        {rows.length === 0 && total === 0 && !q ? (
          <EmptyState icon={SearchX} title={t("empty")} hint={t("emptyHint")} />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("emptyFiltered")}>
            <Link
              href={PATH}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("resetFilters")}
            </Link>
          </EmptyState>
        ) : (
          <KeyboardRows>
            <Table>
              <caption className="sr-only">{t("caption")}</caption>
              <THead>
                <tr>
                  <TH>{t("cols.name")}</TH>
                  <TH>{t("cols.kind")}</TH>
                  <TH>{t("cols.person")}</TH>
                  <TH>{t("cols.phone")}</TH>
                  <TH>{t("cols.email")}</TH>
                  <TH>{t("cols.city")}</TH>
                  <TH>{t("cols.notes")}</TH>
                  <TH>
                    <span className="sr-only">{t("cols.actions")}</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const peek = hrefWith(PATH, sp, { vorschau: r.id });
                  return (
                    <TR
                      key={r.id}
                      tabIndex={0}
                      data-row
                      data-peek={peek}
                      aria-selected={vorschauId === r.id}
                      className="outline-none focus-visible:bg-selected"
                    >
                      <TD className="max-w-52">
                        <Link
                          href={peek as never}
                          scroll={false}
                          tabIndex={-1}
                          className="font-semibold text-accent-soft-foreground hover:underline"
                        >
                          {r.name}
                        </Link>
                      </TD>
                      <TD>
                        <ContactKindBadge kind={r.kind} label={t(`kinds.${r.kind}`)} />
                      </TD>
                      <TD>
                        {r.contactPerson ?? (
                          <span className="text-faint-foreground">{t("none")}</span>
                        )}
                      </TD>
                      <TD>
                        {r.phone ? (
                          <PhoneLink phone={r.phone} />
                        ) : (
                          <span className="text-faint-foreground">{t("none")}</span>
                        )}
                      </TD>
                      <TD className="max-w-44 truncate">
                        {r.email ? (
                          <MailLink email={r.email} />
                        ) : (
                          <span className="text-faint-foreground">{t("none")}</span>
                        )}
                      </TD>
                      <TD>
                        {r.city ?? <span className="text-faint-foreground">{t("none")}</span>}
                      </TD>
                      <TD
                        className="max-w-36 truncate text-muted-foreground"
                        title={r.notes ?? undefined}
                      >
                        {r.notes ?? ""}
                      </TD>
                      <TD className="w-20">
                        <RowActions>
                          <Link
                            href={peek as never}
                            scroll={false}
                            tabIndex={-1}
                            aria-label={t("preview", { name: r.name })}
                            className="grid size-7 place-items-center rounded-md hover:bg-hover"
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canWrite && (
                            <Link
                              href={`/kontakte/${r.id}/bearbeiten` as never}
                              tabIndex={-1}
                              aria-label={t("editRow", { name: r.name })}
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

      {vorschauId && (
        <ContactVorschau id={vorschauId} closeHref={hrefWith(PATH, sp, { vorschau: undefined })} />
      )}
    </Page>
  );
}
