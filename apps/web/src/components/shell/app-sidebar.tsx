import { can } from "@marktwerk/core";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Contact,
  Euro,
  FileCheck2,
  Home,
  KanbanSquare,
  MapPin,
  Store,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { todayIn } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { getActor } from "@/server/actor";
import { missingPermitCount } from "@/server/queries/permits";
import type { CurrentUser } from "@/server/session";
import { getUiState } from "@/server/ui-state";
import { ProfileMenu } from "./profile-menu";
import { type NavEntry, SidebarNav } from "./sidebar-nav";

type Item = NavEntry & { visible: boolean };

/**
 * Five daily entries (Übersicht, Board, Veranstaltungen, Kalender, Genehmigungen), then the collapsible
 * Stammdaten group (Orte, Kontakte, Aussteller, Wissen, Pflichten). Einstellungen lives in the profile
 * menu. Entries of hidden modules (team, finance) are not rendered at all. The notification center has no entry: the bell in the top bar
 * is the way in (decision 2026-10-22).
 */
export async function AppSidebar({
  user,
  displayName,
  theme,
  density,
}: {
  user: CurrentUser;
  displayName: string;
  theme: string;
  density: string;
}) {
  const t = await getTranslations("nav");
  const tRoles = await getTranslations("roles");
  const r = user.role;
  const actor = await getActor();
  const [needsAction, masterDataOpen] = await Promise.all([
    missingPermitCount(actor, todayIn()),
    getUiState("navMasterData"),
  ]);
  const daily: Item[] = [
    { href: "/", label: t("overview"), icon: <Home />, visible: true },
    { href: "/board", label: t("board"), icon: <KanbanSquare />, visible: can(r, "task", "read") },
    {
      href: "/veranstaltungen",
      label: t("events"),
      icon: <CalendarDays />,
      visible: can(r, "event", "read"),
    },
    {
      href: "/kalender",
      label: t("calendar"),
      icon: <CalendarRange />,
      visible: can(r, "event", "read"),
    },
    {
      href: "/genehmigungen",
      label: t("permits"),
      icon: <FileCheck2 />,
      badge: needsAction,
      badgeLabel: t("permitsBadge"),
      visible: can(r, "permit", "read"),
    },
    {
      href: "/team",
      label: t("team"),
      icon: <Users />,
      visible: isModuleVisible("team") && can(r, "team", "read"),
    },
    {
      href: "/finanzen",
      label: t("finance"),
      icon: <Euro />,
      visible: isModuleVisible("finance") && can(r, "finance", "read"),
    },
  ];
  const masterData: Item[] = [
    { href: "/orte", label: t("venues"), icon: <MapPin />, visible: can(r, "venue", "read") },
    {
      href: "/kontakte",
      label: t("contacts"),
      icon: <Contact />,
      visible: can(r, "contact", "read"),
    },
    {
      href: "/aussteller",
      label: t("vendors"),
      icon: <Store />,
      visible: can(r, "vendor", "read"),
    },
    {
      href: "/wissen",
      label: t("knowledgeBase"),
      icon: <BookOpen />,
      visible: can(r, "kb", "read"),
    },
    {
      href: "/firma",
      label: t("duties"),
      icon: <ClipboardCheck />,
      visible: can(r, "company", "read"),
    },
  ];
  const strip = (list: Item[]): NavEntry[] =>
    list.filter((i) => i.visible).map(({ visible: _v, ...i }) => i);
  return (
    <SidebarNav
      brand="marktwerk"
      navLabel={t("label")}
      closeLabel={t("close")}
      hideLabel={t("hide")}
      items={strip(daily)}
      group={{ label: t("masterData"), items: strip(masterData), defaultOpen: masterDataOpen }}
      footer={
        <ProfileMenu
          name={displayName}
          role={tRoles(user.role)}
          theme={theme}
          density={density}
          showSettings={can(r, "settings", "read")}
        />
      }
    />
  );
}
