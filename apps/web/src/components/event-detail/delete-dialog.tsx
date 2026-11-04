"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { X } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadDeleteInfo, removeEvent } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventDeleteBlockers } from "@/server/services/event-lifecycle";

type Info = { name: string; blockers: EventDeleteBlockers };

const BLOCKER_KEYS = ["payables", "expenses", "shifts", "documents"] as const;

/**
 * "Veranstaltung löschen" (product owner 2026-11-04): permanent, so a deliberate exception to "undo toasts
 * over confirmation dialogs". The dialog first loads what blocks the deletion; without blockers the red button
 * stays disabled until the event's name is typed exactly (surrounding spaces ignored, case-sensitive).
 * After deleting, the event page goes back to the list; the list just refreshes.
 */
export function DeleteDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("eventDetail.delete");
  const { showToast } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  // Every time the dialog opens it asks the server again and starts with an empty field.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when opening
  useEffect(() => {
    if (!open) return;
    let current = true;
    setInfo(null);
    setTyped("");
    setError(null);
    void loadDeleteInfo(eventId).then((result) => {
      if (!current) return;
      if (result.ok) setInfo(result.data);
      else setError(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, [open, eventId]);

  const blocked = info
    ? BLOCKER_KEYS.filter((key) => info.blockers[key] > 0).map((key) => ({
        key,
        count: info.blockers[key],
      }))
    : [];
  const matches = info !== null && typed.trim() === info.name.trim();
  const isBlocked = blocked.length > 0;

  // Focus the name field once the check is through (and again after a failed submit re-enabled it).
  useEffect(() => {
    if (open && info !== null && !isBlocked && !pending) inputRef.current?.focus();
  }, [open, info, isBlocked, pending]);

  function submit() {
    if (!info || !matches || blocked.length > 0) return;
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof removeEvent>>;
      try {
        result = await removeEvent(eventId, typed);
      } catch {
        setError(t("errors.generic"));
        return;
      }
      if (!result.ok) {
        if (result.error === "blocked" && result.blockers) {
          setInfo({ name: info.name, blockers: result.blockers });
          return;
        }
        setError(errorText(result.error));
        return;
      }
      onOpenChange(false);
      showToast({ message: t("deleted", { name: result.data.name }) });
      if (pathname.startsWith(`/veranstaltungen/${eventId}`)) router.push("/veranstaltungen");
      else if (searchParams.get("vorschau") === eventId) {
        // The Vorschau of the deleted event must not stay open (or linkable): same list URL without it.
        const rest = new URLSearchParams(searchParams.toString());
        rest.delete("vorschau");
        const query = rest.toString();
        router.replace((query ? `${pathname}?${query}` : pathname) as Route);
      } else router.refresh();
    });
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-scrim" />
        <AlertDialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-40 flex max-h-[calc(100dvh-2rem)] w-[min(480px,calc(100%-2rem))] flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-overlay outline-hidden">
          <div className="flex items-start justify-between gap-3">
            <AlertDialog.Title className="font-semibold text-lg">
              {isBlocked ? t("blockedTitle") : t("title")}
            </AlertDialog.Title>
            <AlertDialog.Close
              aria-label={t("close")}
              className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover"
            >
              <X aria-hidden className="size-4" />
            </AlertDialog.Close>
          </div>

          {blocked.length > 0 ? (
            <>
              <AlertDialog.Description className="text-small">
                {t("blockedIntro")}
              </AlertDialog.Description>
              <ul className="list-disc pl-5 text-small">
                {blocked.map(({ key, count }) => (
                  <li key={key}>{t(key, { count })}</li>
                ))}
              </ul>
              <p className="text-muted-foreground text-small">{t("blockedHint")}</p>
              <div className="flex justify-end">
                <AlertDialog.Close render={<Button />}>{t("cancel")}</AlertDialog.Close>
              </div>
            </>
          ) : (
            <>
              <AlertDialog.Description className="text-muted-foreground text-small">
                {t("description")}
              </AlertDialog.Description>
              <form
                noValidate
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="delete-name">
                    {t("typeName")} <strong className="break-words">{info?.name ?? "…"}</strong>
                  </Label>
                  <Input
                    id="delete-name"
                    ref={inputRef}
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      if (error) setError(null);
                    }}
                    disabled={info === null || pending}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-describedby="delete-status"
                  />
                </div>
                <div id="delete-status" aria-live="polite">
                  {info === null && !error && (
                    <p className="text-muted-foreground text-small">{t("loading")}</p>
                  )}
                  {error && (
                    <p role="alert" className="text-small text-status-critical">
                      {error}
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Close render={<Button disabled={pending} />}>
                    {t("cancel")}
                  </AlertDialog.Close>
                  <Button
                    type="submit"
                    variant="destructive"
                    aria-busy={pending}
                    disabled={!matches || pending}
                  >
                    {t("submit")}
                  </Button>
                </div>
              </form>
            </>
          )}
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
