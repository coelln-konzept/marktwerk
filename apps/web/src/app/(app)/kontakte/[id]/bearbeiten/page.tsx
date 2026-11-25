import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ContactForm } from "@/components/contacts/contact-form";
import { contactListHref, parseContactListParam } from "@/components/contacts/list-context";
import { Page, PageHeader } from "@/components/shell/page";
import { getContact } from "@/server/queries/contacts";
import { CONTACT_KINDS } from "@/server/services/contacts";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("contacts.form"))("titleEdit") };
}

/** `?liste=` is the list's search and filters, to return to after saving (UX-038). */
export default async function EditContactPage({
  params,
  searchParams,
}: PageProps<"/kontakte/[id]/bearbeiten">) {
  await requirePermission("contact", "write");
  const { id } = await params;
  const liste = parseContactListParam((await searchParams).liste);
  const contact = await getContact(id);
  if (!contact) notFound();
  const t = await getTranslations("contacts");
  const kinds = CONTACT_KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }));
  return (
    <Page
      crumbs={[
        { label: t("title"), href: contactListHref(liste) },
        { label: contact.name, href: contactListHref(liste, contact.id) },
        { label: t("form.titleEdit") },
      ]}
    >
      <PageHeader title={contact.name} subtitle={t("form.subtitleEdit")} />
      <ContactForm
        kinds={kinds}
        liste={liste}
        edit={{ id: contact.id, updatedAt: contact.updatedAt }}
        initial={{
          kind: contact.kind,
          name: contact.name,
          contactPerson: contact.contactPerson ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          street: contact.street ?? "",
          postalCode: contact.postalCode ?? "",
          city: contact.city ?? "",
          notes: contact.notes ?? "",
        }}
      />
    </Page>
  );
}
