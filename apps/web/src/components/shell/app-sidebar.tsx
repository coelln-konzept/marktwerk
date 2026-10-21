import { can } from "@marktwerk/core";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Euro,
  FileCheck2,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Package,
  Settings,
  Store,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/server/session";
import { LanguageSwitcher } from "./language-switcher";
import { SignOutButton } from "./sign-out-button";

type NavKey =
  | "overview"
  | "board"
  | "events"
  | "logbook"
  | "team"
  | "finance"
  | "company"
  | "vendors"
  | "templates"
  | "knowledgeBase"
  | "notifications"
  | "settings";

type NavItem = {
  href: string;
  key: NavKey;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
};

export async function AppSidebar({ user }: { user: CurrentUser }) {
  const t = await getTranslations();
  // Order follows the Phase 1 roadmap (docs/product/roadmap.md).
  const items: NavItem[] = [
    { href: "/", key: "overview", icon: LayoutDashboard, visible: true },
    { href: "/board", key: "board", icon: KanbanSquare, visible: can(user.role, "task", "read") },
    {
      href: "/events",
      key: "events",
      icon: CalendarDays,
      visible: can(user.role, "event", "read"),
    },
    {
      href: "/logbook",
      key: "logbook",
      icon: FileCheck2,
      visible: can(user.role, "permit", "read"),
    },
    { href: "/team", key: "team", icon: Users, visible: can(user.role, "team", "read") },
    { href: "/finance", key: "finance", icon: Euro, visible: can(user.role, "finance", "read") },
    {
      href: "/company",
      key: "company",
      icon: Building2,
      visible: can(user.role, "company", "read"),
    },
    { href: "/vendors", key: "vendors", icon: Store, visible: can(user.role, "vendor", "read") },
    {
      href: "/templates",
      key: "templates",
      icon: ClipboardList,
      visible: can(user.role, "template", "read"),
    },
    { href: "/kb", key: "knowledgeBase", icon: BookOpen, visible: can(user.role, "kb", "read") },
    { href: "/notifications", key: "notifications", icon: Bell, visible: true },
    {
      href: "/settings",
      key: "settings",
      icon: Settings,
      visible: can(user.role, "settings", "read"),
    },
  ];
  // Phase 2 modules, shown disabled so the team sees what's coming.
  const upcoming = [
    { key: "bookings", icon: Ticket },
    { key: "inbox", icon: Inbox },
    { key: "inventory", icon: Package },
  ] as const;

  return (
    <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-4 text-lg font-semibold tracking-tight">{t("app.name")}</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {items
          .filter((item) => item.visible)
          .map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href as never}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent"
            >
              <Icon className="size-4 text-muted-foreground" />
              {t(`nav.${key}`)}
            </Link>
          ))}
        <div className="pt-4">
          {upcoming.map(({ key, icon: Icon }) => (
            <span
              key={key}
              className="flex cursor-not-allowed items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground/60"
            >
              <Icon className="size-4" />
              {t(`nav.${key}`)}
              <span className="ml-auto text-[10px] uppercase tracking-wide">
                {t("nav.comingSoon")}
              </span>
            </span>
          ))}
        </div>
      </nav>
      <div className="space-y-2 border-t border-sidebar-border p-3 text-sm">
        <div>
          <div className="font-medium">{user.name}</div>
          <div className="text-xs text-muted-foreground">{t(`roles.${user.role}`)}</div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitcher />
          <SignOutButton label={t("nav.signOut")} />
        </div>
      </div>
    </aside>
  );
}
