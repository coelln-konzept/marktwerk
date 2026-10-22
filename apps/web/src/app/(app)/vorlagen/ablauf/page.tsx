import { redirect } from "next/navigation";
import { requirePermission } from "@/server/session";

/** The per-type timeline templates are listed under "Weitere Ablaufvorlagen" in the Bibliothek. */
export default async function TimelineTemplatesPage() {
  await requirePermission("template", "read");
  redirect("/einstellungen/bibliothek");
}
