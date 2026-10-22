"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { markAllReadAction, markUnreadAction } from "@/app/(app)/benachrichtigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import type { NotificationGroup } from "@/lib/notification-reasons";

/** "Alle als gelesen markieren" (optionally only of one filter group); the undo toast marks them unread again. */
export function MarkAllReadButton({
  group,
  disabled,
  compact,
}: {
  group?: NotificationGroup;
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("notificationsPage");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await markAllReadAction(group);
      if (!result.ok) return showToast({ message: t("errors.generic") });
      const { ids } = result.data;
      if (ids.length === 0) return showToast({ message: t("nothingToMark") });
      showToast({
        message: t("markedAllRead", { count: ids.length }),
        actionLabel: t("undo"),
        onAction: async () => {
          await markUnreadAction(ids);
          showToast({ message: t("toast.restored") });
        },
      });
    });
  }

  return (
    <Button
      size={compact ? "sm" : "default"}
      variant={compact ? "ghost" : "outline"}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={run}
    >
      <CheckCheck aria-hidden />
      {t("markAllRead")}
    </Button>
  );
}
