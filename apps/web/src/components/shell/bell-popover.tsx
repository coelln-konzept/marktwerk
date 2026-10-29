"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setNotificationStateAction } from "@/app/(app)/benachrichtigungen/actions";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  link: string | null;
  severity: "info" | "warning" | "critical";
  unread: boolean;
  ago: string | null;
};

const SEVERITY_ICON = {
  info: { icon: Info, className: "text-status-info" },
  warning: { icon: TriangleAlert, className: "text-status-warn" },
  critical: { icon: OctagonAlert, className: "text-status-critical" },
} as const;

/**
 * The bell: unread count as a badge (a number, not only colour) and a popover with the latest eight
 * notifications, "Alle gelesen" and "Alle anzeigen". Opening an entry marks it read.
 */
export function BellPopover({ count, items }: { count: number; items: Item[] }) {
  const t = useTranslations("bell");
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={count > 0 ? t("labelUnread", { count }) : t("label")}
        className="relative grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Bell aria-hidden className="size-4" />
        {count > 0 && (
          <span
            aria-hidden
            className="tabular -top-0.5 -right-0.5 absolute inline-grid h-4 min-w-4 place-items-center rounded-full bg-status-critical-dot px-1 font-bold text-[10px] text-on-critical leading-none"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="flex max-h-[min(560px,calc(100svh-96px))] w-[min(380px,calc(100vw-24px))] flex-col rounded-xl border bg-popover text-popover-foreground shadow-pop outline-hidden">
            <div className="flex items-center justify-between gap-2 border-border-subtle border-b px-4 py-2">
              <Popover.Title className="font-semibold text-[15px]">{t("title")}</Popover.Title>
              <MarkAllReadButton compact disabled={count === 0} />
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-muted-foreground text-small">{t("empty")}</p>
            ) : (
              <ul className="m-0 flex-1 list-none overflow-y-auto p-0">
                {items.map((item) => {
                  const sev = SEVERITY_ICON[item.severity];
                  const Icon = sev.icon;
                  const content = (
                    <>
                      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", sev.className)} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-small", item.unread && "font-semibold")}>
                          {item.title}
                        </span>
                        <span className="tabular block text-muted-foreground text-tiny">
                          {item.ago ? t("ago", { when: item.ago }) : t("now")}
                        </span>
                      </span>
                      {item.unread && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                          <span className="sr-only">{t("unread")}</span>
                        </span>
                      )}
                    </>
                  );
                  const cls =
                    "flex items-start gap-2 border-border-subtle border-b px-4 py-2.5 outline-hidden last:border-b-0 hover:bg-hover focus-visible:bg-hover";
                  return (
                    <li key={item.id}>
                      {item.link ? (
                        <Link
                          href={item.link as never}
                          className={cls}
                          onClick={() => {
                            setOpen(false);
                            if (item.unread) void setNotificationStateAction(item.id, "read");
                          }}
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className={cls}>{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-border-subtle border-t px-4 py-2">
              <Link
                href={"/benachrichtigungen" as never}
                onClick={() => setOpen(false)}
                className="font-medium text-accent-soft-foreground text-small hover:underline"
              >
                {t("viewAll")}
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
