import { redirect } from "next/navigation";
import { isModuleHidden } from "@/lib/modules";

/** Tab hidden in the UI for now (`lib/modules.ts`): direct visits land on the event's Board. */
export default async function EventMoneyTabLayout({
  children,
  params,
}: LayoutProps<"/veranstaltungen/[id]/geld">) {
  if (isModuleHidden("finance")) {
    const { id } = await params;
    redirect(`/veranstaltungen/${id}/board`);
  }
  return children;
}
