import { redirect } from "next/navigation";
import { param } from "@/lib/url";
import { requirePermission } from "@/server/session";

/**
 * The Vorlagen list is gone (client decision 2026-10-22): the markets live in Einstellungen →
 * Bibliothek. Old links (`/vorlagen?vorschau=<id>`) keep working.
 */
export default async function TemplatesPage({ searchParams }: PageProps<"/vorlagen">) {
  await requirePermission("template", "read");
  const vorschau = param((await searchParams).vorschau);
  redirect(
    vorschau && /^[0-9a-f-]{36}$/i.test(vorschau)
      ? (`/einstellungen/bibliothek?vorschau=${vorschau}` as never)
      : "/einstellungen/bibliothek",
  );
}
