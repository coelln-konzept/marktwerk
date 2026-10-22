import { redirect } from "next/navigation";
import { requirePermission } from "@/server/session";

/** The Firma area opens on the obligations; vehicles and defects are tabs next to it. */
export default async function CompanyPage() {
  await requirePermission("company", "read");
  redirect("/firma/pflichten");
}
