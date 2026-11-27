"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  clearUnavailabilityAction,
  setUnavailabilityAction,
} from "@/app/(app)/team/planung/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

const NOTE_MAX = 200;

/** "Entfernen" of one range; undo sets the same days with the same note again. */
export function RemoveUnavailabilityButton({
  staffMemberId,
  name,
  range,
  label,
}: {
  staffMemberId: string;
  name: string;
  range: { from: string; to: string; dates: string[]; note: string | null };
  /** The range as shown ("Sa–Mo 12.–14.12."). */
  label: string;
}) {
  const t = useTranslations("planning");
  const { showToast, showError } = useShell();
  const [pending, start] = useTransition();
  const fail = () => showError(t("error"));

  const remove = () =>
    start(async () => {
      const result = await clearUnavailabilityAction(staffMemberId, range.dates);
      if (!result.ok) return fail();
      showToast({
        message: t("toast.unavailableCleared", { name, date: label }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await setUnavailabilityAction(
            staffMemberId,
            range.from,
            range.to,
            range.note,
          );
          if (!undone.ok) fail();
        },
      });
    });

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={remove}
      disabled={pending}
      aria-busy={pending}
      aria-label={t("unavailability.removeLabel", { range: label })}
    >
      <X aria-hidden />
      {t("unavailability.remove")}
    </Button>
  );
}

/** "Hinzufügen": von, bis (defaults to von) and a note, saved as one row per day. */
export function AddUnavailabilityButton({
  staffMemberId,
  today,
}: {
  staffMemberId: string;
  today: string;
}) {
  const t = useTranslations("planning.unavailability");
  const tPlanning = useTranslations("planning");
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setFrom(null);
    setTo(null);
    setNote("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    const until = to ?? from;
    if (!from || !until || until < from) return setError(t("invalid"));
    setError(null);
    start(async () => {
      const result = await setUnavailabilityAction(
        staffMemberId,
        from,
        until,
        note.trim() === "" ? null : note.trim(),
      );
      if (!result.ok) return setError(tPlanning("error"));
      setOpen(false);
      showToast({ message: t("saved", { count: result.data.dates.length }) });
    });
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={openDialog}>
        <Plus aria-hidden />
        {t("add")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("addTitle")}
        description={t("addDescription")}
        closeLabel={t("cancel")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unavailable-from">{t("from")}</Label>
              <DateField
                id="unavailable-from"
                value={from}
                min={today}
                required
                className="w-full"
                onValueChange={(value) => {
                  setFrom(value);
                  if (value && (to === null || to < value)) setTo(value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unavailable-to">{t("to")}</Label>
              <DateField
                id="unavailable-to"
                value={to}
                min={from ?? today}
                className="w-full"
                onValueChange={setTo}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="unavailable-note" optional>
                {t("note")}
              </Label>
              <Input
                id="unavailable-note"
                value={note}
                maxLength={NOTE_MAX}
                autoComplete="off"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="m-0 text-small text-status-critical">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
