import { notFound } from "next/navigation";
import { isModuleHidden } from "@/lib/modules";

/** Module hidden in the UI for now (`lib/modules.ts`): every page below answers 404. */
export default function TeamLayout({ children }: LayoutProps<"/team">) {
  if (isModuleHidden("team")) notFound();
  return children;
}
