"use client";

import { ROLES } from "@marktwerk/core";
import { UserCheck, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  deactivateUser,
  reactivateUser,
  setUserRole,
  setUserStaffLink,
} from "@/app/(app)/einstellungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { SELECT_CLASS } from "./select-class";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/** Shared by the three controls: error code → German text, with a generic fallback. */
function useErrorText() {
  const t = useTranslations("settings.users");
  return (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
}

/**
 * Role of one login. Changing it saves at once and offers "Rückgängig" in a toast (no confirmation
 * dialog). Disabled for the last active owner (the server refuses it as well).
 */
export function RoleSelect({
  userId,
  name,
  role,
  locked,
  describedBy,
}: {
  userId: string;
  name: string;
  role: string;
  locked: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("settings.users");
  const tRoles = useTranslations("roles");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function change(select: HTMLSelectElement) {
    const to = select.value;
    const from = role;
    if (to === from) return;
    startTransition(async () => {
      const result = (await setUserRole(userId, to)) as Result;
      if (!result.ok) {
        select.value = from;
        showToast({ message: errorText(result.error) });
        return;
      }
      showToast({
        message: t("toasts.role", { name, role: tRoles(to as never) }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = (await setUserRole(userId, from)) as Result;
          showToast({
            message: undone.ok
              ? t("toasts.roleReverted", { name, role: tRoles(from as never) })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <select
      // Remount with the server's value after a refresh, so an undone or refused change shows the truth.
      key={role}
      defaultValue={role}
      disabled={locked || pending}
      aria-busy={pending}
      aria-label={t("roleFor", { name })}
      aria-describedby={describedBy}
      onChange={(e) => change(e.currentTarget)}
      className={`${SELECT_CLASS} min-w-40`}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {tRoles(r)}
        </option>
      ))}
    </select>
  );
}

export type StaffOption = { id: string; displayName: string };

/** Link between a login and a staff member (1:1, optional). Offers only people without another login. */
export function StaffLinkSelect({
  userId,
  name,
  staffId,
  options,
}: {
  userId: string;
  name: string;
  staffId: string | null;
  options: StaffOption[];
}) {
  const t = useTranslations("settings.users");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const nameOf = (id: string | null) => options.find((o) => o.id === id)?.displayName ?? "";

  function change(select: HTMLSelectElement) {
    const to = select.value === "" ? null : select.value;
    const from = staffId;
    if (to === from) return;
    startTransition(async () => {
      const result = (await setUserStaffLink(userId, to)) as Result;
      if (!result.ok) {
        select.value = from ?? "";
        showToast({ message: errorText(result.error) });
        return;
      }
      showToast({
        message: to
          ? t("toasts.linked", { name, staff: nameOf(to) })
          : t("toasts.unlinked", { name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = (await setUserStaffLink(userId, from)) as Result;
          showToast({
            message: undone.ok ? t("toasts.relinkReverted", { name }) : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <select
      key={staffId ?? "none"}
      defaultValue={staffId ?? ""}
      disabled={pending}
      aria-busy={pending}
      aria-label={t("staffFor", { name })}
      onChange={(e) => change(e.currentTarget)}
      className={`${SELECT_CLASS} min-w-48`}
    >
      <option value="">{t("noStaff")}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.displayName}
        </option>
      ))}
    </select>
  );
}

/** Deactivate / reactivate (never delete). Undo toast instead of a confirmation dialog. */
export function ActiveToggle({
  userId,
  name,
  banned,
  locked,
  describedBy,
}: {
  userId: string;
  name: string;
  banned: boolean;
  locked: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("settings.users");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = (await (banned ? reactivateUser(userId) : deactivateUser(userId))) as Result;
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      showToast({
        message: banned ? t("toasts.reactivated", { name }) : t("toasts.deactivated", { name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = (await (banned
            ? deactivateUser(userId)
            : reactivateUser(userId))) as Result;
          showToast({
            message: undone.ok
              ? banned
                ? t("toasts.deactivated", { name })
                : t("toasts.reactivated", { name })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  const Icon = banned ? UserCheck : UserX;
  return (
    <Button
      size="sm"
      onClick={toggle}
      disabled={locked || pending}
      aria-busy={pending}
      aria-describedby={describedBy}
      aria-label={banned ? t("reactivateFor", { name }) : t("deactivateFor", { name })}
    >
      <Icon aria-hidden />
      {banned ? t("reactivate") : t("deactivate")}
    </Button>
  );
}
