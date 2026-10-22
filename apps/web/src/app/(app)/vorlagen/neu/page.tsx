import { redirect } from "next/navigation";
import { requirePermission } from "@/server/session";

/**
 * New markets are created in the planning flow ("Markt planen" → "Neuen Markt anlegen"), the only path
 * that also gives the market its own task template and colour.
 */
export default async function NewPresetPage() {
  await requirePermission("template", "write");
  redirect("/veranstaltungen?erzeugen=1&neu=1");
}
