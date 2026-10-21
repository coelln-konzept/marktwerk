import { can } from "@marktwerk/core";
import { getTranslations } from "next-intl/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShellProvider } from "@/components/shell/shell-context";
import { ToastRegion } from "@/components/shell/toast-region";
import { getActor } from "@/server/actor";
import { getDisplayPreferences } from "@/server/preferences";
import type { SearchHit } from "@/server/search";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const { theme, density } = await getDisplayPreferences();
  const t = await getTranslations("palette.actions");
  const actions: SearchHit[] = [
    ...(can(actor.role, "event", "write")
      ? [{ kind: "action" as const, title: t("generate"), href: "/veranstaltungen?erzeugen=1" }]
      : []),
    { kind: "action", title: t("calendar"), href: "/kalender" },
    { kind: "action", title: t("events"), href: "/veranstaltungen" },
  ];
  return (
    <ShellProvider>
      <div className="flex min-h-svh">
        <AppSidebar user={actor} displayName={actor.displayName} theme={theme} density={density} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <CommandPalette actions={actions} />
      <ToastRegion />
    </ShellProvider>
  );
}
