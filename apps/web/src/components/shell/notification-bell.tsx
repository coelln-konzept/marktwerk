import { can } from "@marktwerk/core";
import { Bell } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatAgo, todayIn } from "@/lib/format";
import { HIDDEN_MODULES } from "@/lib/modules";
import { getActor } from "@/server/actor";
import { companyBell, latestNotifications, unreadCount } from "@/server/queries/notifications";
import { BellPopover } from "./bell-popover";
import { CompanyBellPopover } from "./company-bell-popover";

/** The bell in the top bar: unread count and the latest eight in a popover. */
export async function NotificationBell() {
  const actor = await getActor();
  const locale = await getLocale();
  const now = new Date();
  // Owner and manager: the company-wide center; everybody else keeps the personal bell.
  if (can(actor.role, "notification", "read")) {
    const bell = await companyBell(actor, 5, now);
    return (
      <CompanyBellPopover
        unread={bell.unread}
        open={bell.open}
        items={bell.items}
        today={todayIn("Europe/Berlin", now)}
      />
    );
  }
  const [count, items] = await Promise.all([
    unreadCount(actor, now, HIDDEN_MODULES),
    latestNotifications(actor, 8, now, HIDDEN_MODULES),
  ]);
  return (
    <BellPopover
      count={count}
      items={items.map((i) => ({
        id: i.id,
        title: i.title,
        link: i.link,
        severity: i.severity,
        unread: i.state === "unread",
        ago: formatAgo(new Date(i.createdAt), now, locale),
      }))}
    />
  );
}

/** Shown while the bell loads (and a plain link, so the way to the centre is never missing). */
export async function BellFallback() {
  const t = await getTranslations("bell");
  return (
    <Link
      href="/benachrichtigungen"
      aria-label={t("label")}
      className="relative grid size-8 place-items-center rounded-lg hover:bg-hover"
    >
      <Bell className="size-4" />
    </Link>
  );
}
