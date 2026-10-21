import { getTranslations } from "next-intl/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShellProvider } from "@/components/shell/shell-context";
import { ToastRegion } from "@/components/shell/toast-region";
import { type Creatable, creatableFor } from "@/lib/creatable";
import { getActor } from "@/server/actor";
import { getDisplayPreferences } from "@/server/preferences";
import type { SearchHit } from "@/server/search";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const { theme, density } = await getDisplayPreferences();
  const t = await getTranslations("palette.actions");
  const creatable = creatableFor(actor.role);
  const can = (kind: Creatable) => creatable.includes(kind);
  const actions: SearchHit[] = [
    ...(can("event")
      ? [
          { kind: "action" as const, title: t("generate"), href: "/veranstaltungen?erzeugen=1" },
          { kind: "action" as const, title: t("single"), href: "/veranstaltungen/neu" },
        ]
      : []),
    ...(can("task") ? [{ kind: "action" as const, title: t("task"), href: "/board?neu=1" }] : []),
    ...(can("payable")
      ? [{ kind: "action" as const, title: t("payable"), href: "/finanzen/neu" }]
      : []),
    ...(can("permit")
      ? [{ kind: "action" as const, title: t("permit"), href: "/logbuch?neu=1" }]
      : []),
    ...(can("shift")
      ? [{ kind: "action" as const, title: t("shift"), href: "/team/schichten?neu=1" }]
      : []),
    ...(can("issue")
      ? [{ kind: "action" as const, title: t("issue"), href: "/firma/maengel?neu=1" }]
      : []),
    { kind: "action", title: t("calendar"), href: "/kalender" },
    { kind: "action", title: t("events"), href: "/veranstaltungen" },
  ];
  return (
    <ShellProvider creatable={creatable}>
      <div className="flex min-h-svh">
        <AppSidebar user={actor} displayName={actor.displayName} theme={theme} density={density} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <CommandPalette actions={actions} />
      <ToastRegion />
    </ShellProvider>
  );
}
