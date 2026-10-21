"use client";

import { Camera, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { reportIssueAction } from "@/app/(app)/firma/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SELECT_CLASS, useErrorText } from "./shared";

const SEVERITIES = ["minor", "major", "critical"] as const;

/**
 * "Mangel melden": vehicle, reporter (a staff member), severity and a description. Six fields, so a modal.
 * With `vehicleId` the vehicle is fixed (opened from the vehicle's page).
 */
export function ReportIssueButton({
  vehicles,
  staff,
  defaultReporterId,
  vehicleId,
  variant = "default",
}: {
  vehicles: { id: string; name: string; plate: string }[];
  staff: { id: string; name: string }[];
  /** The signed-in person's staff record, if they have one. */
  defaultReporterId: string | null;
  vehicleId?: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("company");
  const ti = useTranslations("company.issueDialog");
  const tk = useTranslations("company.issues.severity");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [vehicle, setVehicle] = useState(vehicleId ?? "");
  const [severity, setSeverity] = useState("minor");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporter, setReporter] = useState(defaultReporterId ?? "");
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  function openDialog() {
    setVehicle(vehicleId ?? (vehicles.length === 1 ? (vehicles[0]?.id ?? "") : ""));
    setSeverity("minor");
    setTitle("");
    setDescription("");
    setReporter(defaultReporterId ?? "");
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await reportIssueAction({
        vehicleId: vehicle,
        title,
        description: description || null,
        severity,
        reportedByStaffMemberId: reporter || null,
      });
      if (!result.ok) {
        const field =
          result.error === "invalid_vehicle"
            ? "issue-vehicle"
            : result.error === "invalid_name"
              ? "issue-title"
              : result.error === "invalid_staff"
                ? "issue-reporter"
                : null;
        setError({ field, text: errorText(result.error) });
        if (field) document.getElementById(field)?.focus();
        return;
      }
      setOpen(false);
      showToast({ message: ti("saved") });
    });
  }

  const invalid = (field: string) =>
    error?.field === field ? { "aria-invalid": true as const } : {};

  return (
    <>
      <Button variant={variant} onClick={openDialog}>
        <Plus aria-hidden />
        {ti("save")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={ti("title")}
        description={ti("description")}
        closeLabel={t("close")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-vehicle">{ti("vehicle")}</Label>
              <select
                id="issue-vehicle"
                value={vehicle}
                disabled={vehicleId !== undefined}
                className={SELECT_CLASS}
                onChange={(e) => setVehicle(e.target.value)}
                {...invalid("issue-vehicle")}
              >
                <option value="">{ti("choose")}</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.plate}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-severity">{ti("severity")}</Label>
              <select
                id="issue-severity"
                value={severity}
                aria-describedby="issue-severity-hint"
                className={SELECT_CLASS}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {tk(s)}
                  </option>
                ))}
              </select>
            </div>
            <p id="issue-severity-hint" className="text-faint-foreground text-small sm:col-span-2">
              {ti("severityHint")}
            </p>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="issue-title">{ti("issueTitle")}</Label>
              <Input
                id="issue-title"
                value={title}
                maxLength={120}
                required
                autoComplete="off"
                onChange={(e) => setTitle(e.target.value)}
                {...invalid("issue-title")}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="issue-description">{ti("details")}</Label>
              <textarea
                id="issue-description"
                value={description}
                rows={3}
                maxLength={2000}
                className={TEXTAREA_CLASS}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-reporter">{ti("reporter")}</Label>
              <select
                id="issue-reporter"
                value={reporter}
                className={SELECT_CLASS}
                onChange={(e) => setReporter(e.target.value)}
                {...invalid("issue-reporter")}
              >
                <option value="">{t("none")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {/*
              PLACEHOLDER(photo): photos of a defect are `document` rows with `vehicle_issue_id`. The document
              storage is built in another module; once it exists, replace this disabled control with its
              uploader (camera on phones) and pass the new issue's id to it after `reportIssueAction`.
            */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-photo">{ti("photo")}</Label>
              <div className="flex min-h-(--control-h) items-center gap-2 rounded-lg border border-input border-dashed bg-sunken px-3 text-muted-foreground text-small">
                <Camera aria-hidden className="size-4 shrink-0" />
                <span id="issue-photo">{ti("photoPlaceholder")}</span>
              </div>
            </div>
          </div>
          <p role="alert" className="min-h-5 text-small text-status-critical">
            {error?.text}
          </p>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {ti("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
