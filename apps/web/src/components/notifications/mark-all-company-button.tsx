"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  markAllCompanyReadAction,
  markCompanyUnreadAction,
} from "@/app/(app)/benachrichtigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";

/** "Alle als gelesen" for the open items in the current filter; the undo toast makes them unread again. */
export function MarkAllCompanyButton({
  art,
  markt,
  disabled,
  compact,
}: {
  art?: string;
  markt?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("notificationCenter");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await markAllCompanyReadAction(art, markt);
      if (!result.ok) return showToast({ message: t("errors.generic") });
      const { ids } = result.data;
      if (ids.length === 0) return showToast({ message: t("toast.nothingToMark") });
      showToast({
        message: t("toast.markedAll", { count: ids.length }),
        actionLabel: t("actions.undo"),
        onAction: async () => {
          await markCompanyUnreadAction(ids);
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
      {t("actions.markAllRead")}
    </Button>
  );
}
