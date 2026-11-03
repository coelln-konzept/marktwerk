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
  iconOnlyOnPhone,
}: {
  art?: string;
  markt?: string;
  disabled?: boolean;
  compact?: boolean;
  /** Below sm only the icon shows (the page header keeps one line); the label stays the accessible name. */
  iconOnlyOnPhone?: boolean;
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
      title={iconOnlyOnPhone ? t("actions.markAllRead") : undefined}
      className={iconOnlyOnPhone ? "max-sm:w-8 max-sm:px-0" : undefined}
      onClick={run}
    >
      <CheckCheck aria-hidden />
      <span className={iconOnlyOnPhone ? "max-sm:sr-only" : undefined}>
        {t("actions.markAllRead")}
      </span>
    </Button>
  );
}
