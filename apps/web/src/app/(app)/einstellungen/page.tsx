import { redirect } from "next/navigation";
import { requirePermission } from "@/server/session";

/** The first tab is the landing page of Einstellungen. */
export default async function SettingsIndex() {
  await requirePermission("settings", "read");
  redirect("/einstellungen/firma");
}
