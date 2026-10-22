"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addZoneAction, renameZoneAction } from "@/app/(app)/orte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useErrorText } from "./shared";

/** One field, so a modal: add a zone to a venue (`zone` unset) or rename one. */
export function ZoneDialog({
  open,
  onOpenChange,
  venueId,
  zone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  zone?: { id: string; name: string };
}) {
  const t = useTranslations("venues.manage");
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t(zone ? "zone.renameTitle" : "zone.addTitle")}
      description={zone ? undefined : t("zone.addDescription")}
      closeLabel={t("close")}
    >
      <ZoneForm venueId={venueId} zone={zone} onClose={() => onOpenChange(false)} />
    </Modal>
  );
}

/** Mounted fresh each time the dialog opens, so the field always starts from the current name. */
function ZoneForm({
  venueId,
  zone,
  onClose,
}: {
  venueId: string;
  zone?: { id: string; name: string };
  onClose: () => void;
}) {
  const t = useTranslations("venues.manage");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(zone?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      const result = zone
        ? await renameZoneAction(zone.id, name)
        : await addZoneAction(venueId, name);
      if (!result.ok) {
        setError(errorText(result.error));
        document.getElementById("zone-name")?.focus();
        return;
      }
      onClose();
      if (zone && "changed" in result.data && !result.data.changed) {
        showToast({ message: t("zone.unchanged") });
        return;
      }
      showToast({ message: t(zone ? "zone.renamed" : "zone.added", { zone: name.trim() }) });
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="zone-name">{t("zone.name")}</Label>
        <Input
          id="zone-name"
          value={name}
          maxLength={60}
          required
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "zone-error" : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p id="zone-error" role="alert" className="text-small text-status-critical">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {t(zone ? "zone.submitRename" : "zone.submitAdd")}
        </Button>
      </div>
    </form>
  );
}
