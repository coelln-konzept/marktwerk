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
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function run() {
    startTransition(async () => {
      const result = await markAllReadAction(group);
      if (!result.ok) return showError(t("errors.generic"));
      const { ids } = result.data;
      if (ids.length === 0) return showToast({ message: t("nothingToMark") });
      showToast({
        message: t("markedAllRead", { count: ids.length }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await markUnreadAction(ids);
          if (undone.ok) showToast({ message: t("toast.restored") });
          else showError(errorText(undone.error));
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
