"use client";

import { Menu } from "@base-ui/react/menu";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  Info,
  Mail,
  MailOpen,
  OctagonAlert,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  restoreNotificationAction,
  setNotificationStateAction,
  snoozeNotificationAction,
} from "@/app/(app)/benachrichtigungen/actions";
import { formatInstant } from "@/components/event-detail/format-instant";
import { useShell } from "@/components/shell/shell-context";
import { StatusBadge } from "@/components/ui/status-badge";
import { SNOOZE_CHOICES } from "@/lib/notification-reasons";
import { cn } from "@/lib/utils";
import type { NotificationRow } from "@/server/queries/notifications";

const SEVERITY = {
  info: { tone: "info", icon: Info },
  warning: { tone: "warn", icon: TriangleAlert },
  critical: { tone: "critical", icon: OctagonAlert },
} as const;

const iconButton =
  "grid size-8 cursor-pointer place-items-center rounded-md hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4";
const menuItem =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover";

/**
 * One notification in the centre: unread dot, severity (colour + icon + word), reason, title and detail,
 * age, and the actions Erledigt · Später · Merken · gelesen/ungelesen. Every change shows an undo toast.
 */
export function NotificationItem({
  row,
  ago,
}: {
  row: NotificationRow;
  /** Age text such as "3 Std."; null = just now. */
  ago: string | null;
}) {
  const t = useTranslations("notificationsPage");
  const tBell = useTranslations("bell");
  const locale = useLocale();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const unread = row.state === "unread";
  const severity = SEVERITY[row.severity];

  function change(state: NotificationRow["state"], message: string) {
    startTransition(async () => {
      const result = await setNotificationStateAction(row.id, state);
      if (!result.ok) return showToast({ message: t(`errors.${result.error}` as never) });
      const { previous, changed } = result.data;
      if (!changed) return;
      showToast({
        message,
        actionLabel: t("undo"),
        onAction: async () => {
          await restoreNotificationAction(row.id, previous);
          showToast({ message: t("toast.restored") });
        },
      });
    });
  }

  function snooze(choice: string) {
    startTransition(async () => {
      const result = await snoozeNotificationAction(row.id, choice);
      if (!result.ok) return showToast({ message: t("errors.generic") });
      const { until, previous } = result.data;
      showToast({
        message: t("toast.snoozed", { when: formatInstant(new Date(until), locale) }),
        actionLabel: t("undo"),
        onAction: async () => {
          await restoreNotificationAction(row.id, previous);
          showToast({ message: t("toast.restored") });
        },
      });
    });
  }

  const body = (
    <>
      <span className="font-semibold">{row.title}</span>
      {row.body && <span className="block text-muted-foreground text-small">{row.body}</span>}
    </>
  );

  return (
    <li
      className={cn(
        "flex items-start gap-3 border-border-subtle border-b px-4 py-3 last:border-b-0",
        unread && "bg-selected/40",
        row.state === "done" && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "mt-1.5 size-2.5 shrink-0 rounded-full",
          unread ? "bg-primary" : "border border-input",
        )}
      >
        {unread && <span className="sr-only">{t("unread")}</span>}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={severity.tone} icon={severity.icon}>
            {t(`severity.${row.severity}` as never)}
          </StatusBadge>
          <span className="text-muted-foreground text-tiny">
            {t(`reasons.${row.reason}` as never)}
          </span>
          <span className="tabular text-muted-foreground text-tiny">
            {ago ? tBell("ago", { when: ago }) : tBell("now")}
          </span>
        </div>
        {row.link ? (
          <Link
            href={row.link as never}
            onClick={() => {
              if (unread) void setNotificationStateAction(row.id, "read");
            }}
            className="rounded-sm hover:text-accent-soft-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {body}
          </Link>
        ) : (
          <div>{body}</div>
        )}
      </div>
      <div
        className="flex shrink-0 items-center gap-0.5"
        role="toolbar"
        aria-label={t("actionsFor", { title: row.title })}
      >
        {row.state === "done" ? (
          <button
            type="button"
            disabled={pending}
            className={iconButton}
            title={t("reopen")}
            aria-label={t("reopen")}
            onClick={() => change("unread", t("toast.reopened"))}
          >
            <RotateCcw aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            className={iconButton}
            title={t("done")}
            aria-label={t("done")}
            onClick={() => change("done", t("toast.done"))}
          >
            <Check aria-hidden />
          </button>
        )}
        <Menu.Root>
          <Menu.Trigger
            className={iconButton}
            title={t("snooze")}
            aria-label={t("snooze")}
            disabled={pending}
          >
            <Clock aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
              <Menu.Popup className="flex min-w-[200px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
                {SNOOZE_CHOICES.map((choice) => (
                  <Menu.Item key={choice} className={menuItem} onClick={() => snooze(choice)}>
                    {t(`snoozeChoices.${choice}` as never)}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <button
          type="button"
          disabled={pending}
          className={iconButton}
          title={row.state === "saved" ? t("unsave") : t("save")}
          aria-label={row.state === "saved" ? t("unsave") : t("save")}
          aria-pressed={row.state === "saved"}
          onClick={() =>
            row.state === "saved"
              ? change("read", t("toast.read"))
              : change("saved", t("toast.saved"))
          }
        >
          {row.state === "saved" ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
        </button>
        {row.state !== "done" && (
          <button
            type="button"
            disabled={pending}
            className={iconButton}
            title={unread ? t("markRead") : t("markUnread")}
            aria-label={unread ? t("markRead") : t("markUnread")}
            onClick={() =>
              unread ? change("read", t("toast.read")) : change("unread", t("toast.unread"))
            }
          >
            {unread ? <MailOpen aria-hidden /> : <Mail aria-hidden />}
          </button>
        )}
      </div>
    </li>
  );
}
