import { can } from "@marktwerk/core";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  Contact,
  Copy,
  Euro,
  FileCheck2,
  Home,
  Inbox,
  KanbanSquare,
  MapPin,
  Package,
  SlidersHorizontal,
  Store,
  Ticket,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/server/session";
import { ProfileMenu } from "./profile-menu";
import { type NavEntry, SidebarNav } from "./sidebar-nav";

/** Module order follows the design (docs/design/claude-design/a-classic, screen "Sidebar"). */
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
  const items: (NavEntry & { visible: boolean })[] = [
    { href: "/", label: t("overview"), icon: <Home />, visible: true },
    {
      href: "/kalender",
      label: t("calendar"),
      icon: <CalendarRange />,
      visible: can(r, "event", "read"),
    },
    { href: "/board", label: t("board"), icon: <KanbanSquare />, visible: can(r, "task", "read") },
    {
      href: "/veranstaltungen",
      label: t("events"),
      icon: <CalendarDays />,
      visible: can(r, "event", "read"),
    },
    { href: "/orte", label: t("venues"), icon: <MapPin />, visible: can(r, "venue", "read") },
    {
      href: "/logbuch",
      label: t("logbook"),
      icon: <FileCheck2 />,
      visible: can(r, "permit", "read"),
    },
    { href: "/team", label: t("team"), icon: <Users />, visible: can(r, "team", "read") },
    { href: "/finanzen", label: t("finance"), icon: <Euro />, visible: can(r, "finance", "read") },
    {
      href: "/firma",
      label: t("company"),
      icon: <Building2 />,
      visible: can(r, "company", "read"),
    },
    { href: "/haendler", label: t("vendors"), icon: <Store />, visible: can(r, "vendor", "read") },
    {
      href: "/kontakte",
      label: t("contacts"),
      icon: <Contact />,
      visible: can(r, "contact", "read"),
    },
    {
      href: "/vorlagen",
      label: t("templates"),
      icon: <Copy />,
      visible: can(r, "template", "read"),
    },
    {
      href: "/wissen",
      label: t("knowledgeBase"),
      icon: <BookOpen />,
      visible: can(r, "kb", "read"),
    },
    { href: "/benachrichtigungen", label: t("notifications"), icon: <Bell />, visible: true },
    {
      href: "/einstellungen",
      label: t("settings"),
      icon: <SlidersHorizontal />,
      visible: can(r, "settings", "read"),
    },
  ];
  return (
    <SidebarNav
      brand="marktwerk"
      navLabel={t("label")}
      closeLabel={t("close")}
      items={items.filter((i) => i.visible).map(({ visible: _v, ...i }) => i)}
      upcomingTitle={t("later")}
      phaseLabel={t("comingSoon")}
      upcoming={[
        { key: "bookings", label: t("bookings"), icon: <Ticket /> },
        { key: "inbox", label: t("inbox"), icon: <Inbox /> },
        { key: "inventory", label: t("inventory"), icon: <Package /> },
      ]}
      footer={
        <ProfileMenu name={displayName} role={tRoles(user.role)} theme={theme} density={density} />
      }
    />
  );
}
