import { redirect } from "next/navigation";
import { isModuleHidden } from "@/lib/modules";

/** Tab hidden in the UI for now (`lib/modules.ts`): direct visits land on the event's Board. */
export default async function EventTeamTabLayout({
  children,
  params,
}: LayoutProps<"/veranstaltungen/[id]/team">) {
  if (isModuleHidden("team")) {
    const { id } = await params;
    redirect(`/veranstaltungen/${id}`);
  }
  return children;
}
