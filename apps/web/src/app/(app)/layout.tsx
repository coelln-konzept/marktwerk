import { can as roleCan } from "@marktwerk/core";
import { getTranslations } from "next-intl/server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShellProvider } from "@/components/shell/shell-context";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { ToastRegion } from "@/components/shell/toast-region";
import { type Creatable, creatableFor } from "@/lib/creatable";
import { isModuleVisible } from "@/lib/modules";
import { getActor } from "@/server/actor";
import { getDisplayPreferences } from "@/server/preferences";
import type { SearchHit } from "@/server/search-core";
import { getUiState } from "@/server/ui-state";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const { theme, density } = await getDisplayPreferences();
  const t = await getTranslations("palette.actions");
  const tTop = await getTranslations("topbar");
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
      ? [{ kind: "action" as const, title: t("permit"), href: "/genehmigungen?neu=1" }]
      : []),
    ...(can("shift")
      ? [{ kind: "action" as const, title: t("shift"), href: "/team/schichten?neu=1" }]
      : []),
    ...(can("issue")
      ? [{ kind: "action" as const, title: t("issue"), href: "/firma/maengel?neu=1" }]
      : []),
    // The bell is the way in (no sidebar entry, decision 2026-10-22); Strg+K finds the center too.
    ...(isModuleVisible("notifications")
      ? [{ kind: "action" as const, title: t("notifications"), href: "/benachrichtigungen" }]
      : []),
    { kind: "action", title: t("calendar"), href: "/kalender" },
    { kind: "action", title: t("events"), href: "/veranstaltungen" },
    // "Händler" and "Beschicker" are what other tools call the Aussteller: they find this entry, too.
    ...(roleCan(actor.role, "vendor", "read")
      ? [
          {
            kind: "action" as const,
            title: t("vendors"),
            href: "/aussteller",
            keywords: [t("vendorsKeywords")],
          },
        ]
      : []),
    // Einstellungen is not in the sidebar any more (profile menu); Strg+K finds it too.
    ...(roleCan(actor.role, "settings", "read")
      ? [{ kind: "action" as const, title: t("settings"), href: "/einstellungen" }]
      : []),
  ];
  return (
    <ShellProvider creatable={creatable} sidebarHidden={await getUiState("navHidden")}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:font-medium focus:shadow-pop"
      >
        {tTop("skip")}
      </a>
      <div className="flex min-h-svh">
        <AppSidebar user={actor} displayName={actor.displayName} theme={theme} density={density} />
        {/* The page renders its own top bar (banner) and <main id="main"> inside this column. */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <CommandPalette actions={actions} />
      <ShortcutsDialog />
      <ToastRegion />
    </ShellProvider>
  );
}
