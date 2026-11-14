"use client";

import { Camera, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { reportIssueAction, withdrawIssueAction } from "@/app/(app)/firma/actions";
import { DocumentUpload } from "@/components/documents/upload";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { useOpenOnNew } from "@/components/shell/use-new-param";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { FieldError, FormErrorSummary, useFieldErrors } from "./field-errors";
import { SELECT_CLASS, useErrorText } from "./shared";

const SEVERITIES = ["minor", "major", "critical"] as const;

const ORDER = ["vehicle", "severity", "title", "description", "reporter"] as const;

const FIELD_OF: Record<string, string> = {
  invalid_vehicle: "vehicle",
  invalid_severity: "severity",
  invalid_name: "title",
  invalid_text: "description",
  invalid_staff: "reporter",
};

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
  const { showToast, showError } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [vehicle, setVehicle] = useState(vehicleId ?? "");
  const [severity, setSeverity] = useState("minor");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporter, setReporter] = useState(defaultReporterId ?? "");
  const f = (key: string) => `issue-${key}`;
  const { errors, show, clear, invalid } = useFieldErrors(f);
  /** Set once the issue is saved: the dialog then offers the photo upload for that issue. */
  const [reportedId, setReportedId] = useState<string | null>(null);
  /** The same id for the undo toast, which outlives this render. */
  const reportedRef = useRef<string | null>(null);

  function openDialog() {
    setReportedId(null);
    reportedRef.current = null;
    setVehicle(vehicleId ?? (vehicles.length === 1 ? (vehicles[0]?.id ?? "") : ""));
    setSeverity("minor");
    setTitle("");
    setDescription("");
    setReporter(defaultReporterId ?? "");
    clear();
    setOpen(true);
  }

  // "+ Neu › Mangel melden" in the top bar links here with ?neu=1 (the page without a fixed vehicle).
  useOpenOnNew(openDialog, vehicleId === undefined);

  /** The defect's short description is not a name: its own words when it is missing (UX-067). */
  const textOf = (code: string) =>
    code === "invalid_name" ? ti("titleRequired") : errorText(code);

  function submit() {
    clear();
    // Every missing field is answered on the spot, at the field; the first one gets the focus.
    const found: Record<string, string> = {};
    if (vehicle === "") found.vehicle = textOf("invalid_vehicle");
    if (title.trim() === "") found.title = textOf("invalid_name");
    if (Object.keys(found).length > 0) return show(found, ORDER);
    startTransition(async () => {
      const result = await reportIssueAction({
        vehicleId: vehicle,
        title,
        description: description || null,
        severity,
        reportedByStaffMemberId: reporter || null,
      });
      if (!result.ok) {
        show({ [FIELD_OF[result.error] ?? "form"]: textOf(result.error) }, ORDER);
        return;
      }
      // Photos are documents linked to the new issue, so they can only be attached from here on.
      const id = result.data.id;
      setReportedId(id);
      reportedRef.current = id;
      // Reported by mistake: the toast takes it back while nothing happened to it yet (no photo, still open).
      showToast({
        message: ti("saved"),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await withdrawIssueAction(id);
          if (!undone.ok) return showError(errorText(undone.error));
          // Still on the photo step of this very report: that step has nothing left to attach to.
          if (reportedRef.current === id) setOpen(false);
          showToast({ message: ti("withdrawn") });
        },
      });
    });
  }

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
        description={reportedId ? ti("photoStage") : ti("description")}
        closeLabel={t("close")}
      >
        {reportedId ? (
          <div className="flex flex-col gap-4">
            <DocumentUpload
              link={{ vehicleIssueId: reportedId }}
              kind="photo"
              label={ti("photoAdd")}
            />
            <div className="flex justify-end">
              <Button variant="default" onClick={() => setOpen(false)}>
                {ti("done")}
              </Button>
            </div>
          </div>
        ) : (
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
                  {...invalid("vehicle")}
                >
                  <option value="">{ti("choose")}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.plate}
                    </option>
                  ))}
                </select>
                <FieldError id={f("vehicle")} text={errors.vehicle} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-severity">{ti("severity")}</Label>
                <select
                  id="issue-severity"
                  value={severity}
                  className={SELECT_CLASS}
                  onChange={(e) => setSeverity(e.target.value)}
                  {...invalid("severity", "issue-severity-hint")}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {tk(s)}
                    </option>
                  ))}
                </select>
                <FieldError id={f("severity")} text={errors.severity} />
              </div>
              <p
                id="issue-severity-hint"
                className="text-faint-foreground text-small sm:col-span-2"
              >
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
                  {...invalid("title")}
                />
                <FieldError id={f("title")} text={errors.title} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="issue-description" optional>
                  {ti("details")}
                </Label>
                <textarea
                  id="issue-description"
                  value={description}
                  rows={3}
                  maxLength={2000}
                  className={TEXTAREA_CLASS}
                  onChange={(e) => setDescription(e.target.value)}
                  {...invalid("description")}
                />
                <FieldError id={f("description")} text={errors.description} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-reporter">{ti("reporter")}</Label>
                <select
                  id="issue-reporter"
                  value={reporter}
                  className={SELECT_CLASS}
                  onChange={(e) => setReporter(e.target.value)}
                  {...invalid("reporter")}
                >
                  <option value="">{t("none")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <FieldError id={f("reporter")} text={errors.reporter} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="issue-photo">{ti("photo")}</Label>
                <div className="flex min-h-(--control-h) items-center gap-2 rounded-lg border border-input border-dashed bg-sunken px-3 text-muted-foreground text-small">
                  <Camera aria-hidden className="size-4 shrink-0" />
                  <span id="issue-photo">{ti("photoPlaceholder")}</span>
                </div>
              </div>
            </div>
            <div className="min-h-5">
              <FormErrorSummary errors={errors} />
            </div>
            <div className="flex justify-end gap-2">
              <Button disabled={pending} onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
                {ti("save")}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
