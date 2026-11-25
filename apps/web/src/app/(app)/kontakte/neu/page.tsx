import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactForm } from "@/components/contacts/contact-form";
import { contactListHref, parseContactListParam } from "@/components/contacts/list-context";
import { Page, PageHeader } from "@/components/shell/page";
import { CONTACT_KINDS } from "@/server/services/contacts";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("contacts.form"))("titleNew") };
}

/**
 * "Kontakt anlegen": a page, because a contact has nine fields (UX concept §4: modals up to 8).
 * `?liste=` is the list's search and filters, to return to afterwards (UX-038).
 */
export default async function NewContactPage({ searchParams }: PageProps<"/kontakte/neu">) {
  await requirePermission("contact", "write");
  const liste = parseContactListParam((await searchParams).liste);
  const t = await getTranslations("contacts");
  const kinds = CONTACT_KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }));
  return (
    <Page
      crumbs={[{ label: t("title"), href: contactListHref(liste) }, { label: t("form.titleNew") }]}
    >
      <PageHeader title={t("form.titleNew")} subtitle={t("form.subtitleNew")} />
      <ContactForm kinds={kinds} liste={liste} />
    </Page>
  );
}
