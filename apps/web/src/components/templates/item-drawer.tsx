"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  checkTemplateItem,
  defaultAnchors,
  dueDateForNrw,
  type ItemCondition,
  insertPoint,
  normalizeCondition,
  PERMIT_TYPES,
  STANDARD_ANCHOR_KEYS,
  type TemplateItemFields,
} from "@marktwerk/core";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addItemAction, updateItemAction } from "@/app/(app)/vorlagen/ablauf/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { formatDateWithWeekday } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { PHASES, VENUE_KINDS } from "./labels";
import { useOffsetText } from "./offset-text";
import type { ItemView, RoleChoice, TypeChoice } from "./types";

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

const CATEGORIES = [
  "general",
  "permits",
  "logistics",
  "communication",
  "finance",
  "staff",
  "office",
] as const;

type Form = {
  title: string;
  description: string;
  phase: TemplateItemFields["phase"];
  category: TemplateItemFields["category"];
  anchorKey: string;
  offsetDays: string;
  dayMode: TemplateItemFields["dayMode"];
  dueTime: string;
  dutyRoleId: string;
  approverDutyRoleId: string;
  priority: TemplateItemFields["priority"];
  estimateMinutes: string;
  requiresPhoto: boolean;
  requiresNote: boolean;
  requiresAttachment: boolean;
  isKey: boolean;
  permitType: string;
  checkItems: string;
  dependsOnKeys: string[];
  eventTypeKeys: string[];
  venueKinds: string[];
  venueIds: string[];
};

const DEFAULT_OFFSET: Record<TemplateItemFields["phase"], string> = {
  pre: "-7",
  live: "0",
  post: "1",
};

function initialForm(item: ItemView | null, phase: TemplateItemFields["phase"]): Form {
  if (!item)
    return {
      title: "",
      description: "",
      phase,
      category: "general",
      anchorKey: "event_day",
      offsetDays: DEFAULT_OFFSET[phase],
      dayMode: "calendar",
      dueTime: "",
      dutyRoleId: "",
      approverDutyRoleId: "",
      priority: "normal",
      estimateMinutes: "15",
      requiresPhoto: false,
      requiresNote: false,
      requiresAttachment: false,
      isKey: false,
      permitType: "",
      checkItems: "",
      dependsOnKeys: [],
      eventTypeKeys: [],
      venueKinds: [],
      venueIds: [],
    };
  return {
    title: item.title,
    description: item.description ?? "",
    phase: item.phase,
    category: item.category,
    anchorKey: item.anchorKey,
    offsetDays: String(item.offsetDays),
    dayMode: item.dayMode,
    dueTime: item.dueTime ?? "",
    dutyRoleId: item.dutyRoleId ?? "",
    approverDutyRoleId: item.approverDutyRoleId ?? "",
    priority: item.priority,
    estimateMinutes: String(item.estimateMinutes),
    requiresPhoto: item.requiresPhoto,
    requiresNote: item.requiresNote,
    requiresAttachment: item.requiresAttachment,
    isKey: item.isKey,
    permitType: item.permitType ?? "",
    checkItems: item.checkItems.join("\n"),
    dependsOnKeys: item.dependsOnKeys,
    eventTypeKeys: item.condition?.eventTypeKeys ?? [],
    venueKinds: item.condition?.venueKinds ?? [],
    venueIds: item.condition?.venueIds ?? [],
  };
}

/** The typed values as the fields the services take; numbers that are not whole stay NaN (→ invalid). */
function toFields(form: Form): TemplateItemFields {
  const condition: ItemCondition = {
    eventTypeKeys: form.eventTypeKeys,
    venueKinds: form.venueKinds,
    venueIds: form.venueIds,
  };
  const whole = (value: string) => (/^[+-]?\d+$/.test(value.trim()) ? Number(value) : Number.NaN);
  return {
    title: form.title.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    phase: form.phase,
    category: form.category,
    anchorKey: form.anchorKey,
    offsetDays: whole(form.offsetDays),
    dayMode: form.dayMode,
    dueTime: form.dueTime === "" ? null : form.dueTime,
    dutyRoleId: form.dutyRoleId || null,
    priority: form.priority,
    estimateMinutes: whole(form.estimateMinutes),
    requiresPhoto: form.requiresPhoto,
    requiresNote: form.requiresNote,
    requiresAttachment: form.requiresAttachment,
    isKey: form.isKey,
    permitType: (form.permitType || null) as TemplateItemFields["permitType"],
    checkItems: form.checkItems
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    approverDutyRoleId: form.approverDutyRoleId || null,
    dependsOnKeys: form.dependsOnKeys,
    condition: normalizeCondition(condition),
  };
}

/**
 * Detail drawer for one row of a template version (UX concept §4: real work on one record while the list
 * stays visible; addressed as `?zeile=<key>`, `?zeile=neu&phase=pre` for a new row). Editable only in the
 * draft; published versions show the same fields read-only.
 */
export function ItemDrawer({
  versionId,
  editable,
  item,
  newPhase,
  items,
  roles,
  eventTypes,
  extraAnchors,
  defaultDueTime,
  exampleDay,
  closeHref,
}: {
  versionId: string;
  editable: boolean;
  /** null = a new row */
  item: ItemView | null;
  newPhase: TemplateItemFields["phase"];
  items: ItemView[];
  roles: RoleChoice[];
  eventTypes: TypeChoice[];
  /** Anchors this version uses beyond the standard ones. */
  extraAnchors: string[];
  defaultDueTime: string;
  /** Sample event day for the due-date example. */
  exampleDay: string;
  closeHref: string;
}) {
  const t = useTranslations("taskTemplates");
  const tPermitTypes = useTranslations("permitTypes");
  const offsetText = useOffsetText();
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const [form, setForm] = useState(() => initialForm(item, newPhase));
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const disabled = !editable || pending;

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const close = () => router.replace(closeHref as never, { scroll: false });
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const anchorOptions = [...new Set([...STANDARD_ANCHOR_KEYS, ...extraAnchors, form.anchorKey])];
  const anchorName = (key: string) =>
    t.has(`anchors.${key}` as never) ? t(`anchors.${key}` as never) : key;

  const fields = toFields(form);
  const issue = checkTemplateItem(fields)[0];
  const showError = error?.field ?? (error ? "form" : undefined);

  // "Beispiel": when this row would be due for a one-day event on the sample day.
  const anchors = new Map<string, string>(Object.entries(defaultAnchors(exampleDay, 1)));
  const anchorDay = anchors.get(form.anchorKey);
  const example =
    anchorDay && Number.isInteger(fields.offsetDays)
      ? dueDateForNrw(anchorDay, fields.offsetDays, form.dayMode)
      : null;

  // A new row goes where its due date puts it, so the phase stays in order (A7-05).
  const point = insertPoint(items, {
    phase: form.phase,
    anchorKey: form.anchorKey,
    offsetDays: Number.isInteger(fields.offsetDays) ? fields.offsetDays : 0,
  });

  function submit() {
    setError(null);
    if (issue) {
      setError({ text: errorText(issue.code), field: issue.field });
      return;
    }
    startTransition(async () => {
      const result = item
        ? await updateItemAction(versionId, item.key, fields)
        : await addItemAction(versionId, fields, point.afterKey, point.beforeKey);
      if (!result.ok) {
        setError({ text: errorText(result.error), field: result.field });
        return;
      }
      close();
      showToast({
        message: item
          ? "changed" in result.data && !result.data.changed
            ? t("drawer.unchanged")
            : t("drawer.saved", { title: fields.title })
          : t("drawer.added", { title: fields.title }),
      });
    });
  }

  const invalid = (field: string) => showError === field;
  const fieldError = (field: string) =>
    error && error.field === field ? (
      <p role="alert" className="text-small text-status-critical">
        {error.text}
      </p>
    ) : null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !pending && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-40 flex w-[min(540px,100%)] flex-col border-l bg-card shadow-overlay outline-hidden">
          <header className="flex items-start justify-between gap-3 border-border-subtle border-b px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-lg">
                {item
                  ? editable
                    ? t("drawer.editTitle")
                    : t("drawer.viewTitle")
                  : t("drawer.newTitle")}
              </Dialog.Title>
            </div>
            <Dialog.Close
              aria-label={t("drawer.close")}
              className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </header>

          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (editable) submit();
            }}
          >
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-title">{t("drawer.title")}</Label>
                <Input
                  id="item-title"
                  value={form.title}
                  maxLength={200}
                  disabled={disabled}
                  autoFocus={editable}
                  aria-invalid={invalid("title")}
                  onChange={(e) => set({ title: e.target.value })}
                />
                {fieldError("title")}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-description" optional>
                  {t("drawer.description")}
                </Label>
                <textarea
                  id="item-description"
                  rows={2}
                  className={TEXTAREA_CLASS}
                  value={form.description}
                  disabled={disabled}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-phase">{t("drawer.phase")}</Label>
                  <select
                    id="item-phase"
                    className={SELECT_CLASS}
                    value={form.phase}
                    disabled={disabled}
                    onChange={(e) => set({ phase: e.target.value as Form["phase"] })}
                  >
                    {PHASES.map((p) => (
                      <option key={p} value={p}>
                        {t(`phases.${p}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-category">{t("drawer.category")}</Label>
                  <select
                    id="item-category"
                    className={SELECT_CLASS}
                    value={form.category}
                    disabled={disabled}
                    onChange={(e) => set({ category: e.target.value as Form["category"] })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`categories.${c}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 font-semibold text-small">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--primary)"
                    checked={form.isKey}
                    disabled={disabled}
                    onChange={(e) => set({ isKey: e.target.checked })}
                  />
                  {t("drawer.isKey")}
                </label>
                <p className="text-muted-foreground text-tiny">{t("drawer.isKeyHint")}</p>
              </div>

              <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
                <legend className="px-1 font-semibold text-small">{t("drawer.dueLegend")}</legend>
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-anchor">{t("drawer.anchor")}</Label>
                    <select
                      id="item-anchor"
                      className={SELECT_CLASS}
                      value={form.anchorKey}
                      disabled={disabled}
                      aria-invalid={invalid("anchorKey")}
                      onChange={(e) => set({ anchorKey: e.target.value })}
                    >
                      {anchorOptions.map((key) => (
                        <option key={key} value={key}>
                          {anchorName(key)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-offset">{t("drawer.offset")}</Label>
                    <Input
                      id="item-offset"
                      inputMode="numeric"
                      value={form.offsetDays}
                      disabled={disabled}
                      className="tabular"
                      aria-invalid={invalid("offsetDays")}
                      onChange={(e) => set({ offsetDays: e.target.value })}
                    />
                  </div>
                </div>
                {fieldError("anchorKey")}
                {fieldError("offsetDays")}
                {Number.isInteger(fields.offsetDays) && (
                  <p className="tabular font-medium text-small" aria-live="polite">
                    {t("drawer.offsetNow", {
                      text: offsetText.full(fields.offsetDays, form.dayMode),
                    })}
                  </p>
                )}
                <p className="text-muted-foreground text-tiny">{t("drawer.offsetHint")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-daymode">{t("drawer.dayMode")}</Label>
                    <select
                      id="item-daymode"
                      className={SELECT_CLASS}
                      value={form.dayMode}
                      disabled={disabled}
                      onChange={(e) => set({ dayMode: e.target.value as Form["dayMode"] })}
                    >
                      <option value="calendar">{t("dayModes.calendar")}</option>
                      <option value="business">{t("dayModes.business")}</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-time" optional>
                      {t("drawer.time")}
                    </Label>
                    <Input
                      id="item-time"
                      type="time"
                      value={form.dueTime}
                      disabled={disabled}
                      className="tabular"
                      aria-invalid={invalid("dueTime")}
                      onChange={(e) => set({ dueTime: e.target.value })}
                    />
                  </div>
                </div>
                {fieldError("dueTime")}
                <p className="text-muted-foreground text-tiny">
                  {t("drawer.timeHint", { time: defaultDueTime })}
                </p>
                <p className="rounded-md bg-sunken px-3 py-2 text-small" aria-live="polite">
                  {example
                    ? t("drawer.example", {
                        day: formatDateWithWeekday(exampleDay, locale),
                        due: formatDateWithWeekday(example, locale),
                      })
                    : t("drawer.exampleNone")}
                </p>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-role" optional>
                    {t("drawer.role")}
                  </Label>
                  <select
                    id="item-role"
                    className={SELECT_CLASS}
                    value={form.dutyRoleId}
                    disabled={disabled}
                    onChange={(e) => set({ dutyRoleId: e.target.value })}
                  >
                    <option value="">{t("drawer.noRole")}</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-approver" optional>
                    {t("drawer.approver")}
                  </Label>
                  <select
                    id="item-approver"
                    className={SELECT_CLASS}
                    value={form.approverDutyRoleId}
                    disabled={disabled}
                    onChange={(e) => set({ approverDutyRoleId: e.target.value })}
                  >
                    <option value="">{t("drawer.noApprover")}</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="-mt-2 text-muted-foreground text-tiny">{t("drawer.roleHint")}</p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-permit" optional>
                  {t("drawer.permitType")}
                </Label>
                <select
                  id="item-permit"
                  className={SELECT_CLASS}
                  value={form.permitType}
                  disabled={disabled}
                  aria-invalid={invalid("permitType")}
                  onChange={(e) => set({ permitType: e.target.value })}
                >
                  <option value="">{t("drawer.noPermitType")}</option>
                  {PERMIT_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {tPermitTypes(p)}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-tiny">{t("drawer.permitTypeHint")}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-priority">{t("drawer.priority")}</Label>
                  <select
                    id="item-priority"
                    className={SELECT_CLASS}
                    value={form.priority}
                    disabled={disabled}
                    onChange={(e) => set({ priority: e.target.value as Form["priority"] })}
                  >
                    {(["low", "normal", "high"] as const).map((p) => (
                      <option key={p} value={p}>
                        {t(`priorities.${p}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {isModuleVisible("estimates") && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-estimate">{t("drawer.estimate")}</Label>
                    <Input
                      id="item-estimate"
                      inputMode="numeric"
                      value={form.estimateMinutes}
                      disabled={disabled}
                      className="tabular"
                      aria-invalid={invalid("estimateMinutes")}
                      onChange={(e) => set({ estimateMinutes: e.target.value })}
                    />
                  </div>
                )}
              </div>
              {isModuleVisible("estimates") && fieldError("estimateMinutes")}

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 flex gap-2 font-semibold text-small">
                  {t("drawer.evidence")}
                  <OptionalMark />
                </legend>
                {(
                  [
                    ["requiresPhoto", "photo"],
                    ["requiresNote", "note"],
                    ["requiresAttachment", "attachment"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-(--primary)"
                      checked={form[field]}
                      disabled={disabled}
                      onChange={(e) => set({ [field]: e.target.checked })}
                    />
                    {t(`evidence.${label}`)}
                  </label>
                ))}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-steps" optional>
                  {t("drawer.checkItems")}
                </Label>
                <textarea
                  id="item-steps"
                  rows={4}
                  className={TEXTAREA_CLASS}
                  value={form.checkItems}
                  disabled={disabled}
                  aria-invalid={invalid("checkItems")}
                  onChange={(e) => set({ checkItems: e.target.value })}
                />
                <p className="text-muted-foreground text-tiny">{t("drawer.checkItemsHint")}</p>
                {fieldError("checkItems")}
              </div>

              {items.filter((i) => i.key !== item?.key).length > 0 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 flex gap-2 font-semibold text-small">
                    {t("drawer.dependsOn")}
                    <OptionalMark />
                  </legend>
                  <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-lg border p-2">
                    {items
                      .filter((i) => i.key !== item?.key)
                      .map((i) => (
                        <label key={i.key} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-(--primary)"
                            checked={form.dependsOnKeys.includes(i.key)}
                            disabled={disabled}
                            onChange={() =>
                              set({ dependsOnKeys: toggle(form.dependsOnKeys, i.key) })
                            }
                          />
                          {i.title}
                        </label>
                      ))}
                  </div>
                  <p className="text-muted-foreground text-tiny">{t("drawer.dependsOnHint")}</p>
                  {fieldError("dependsOnKeys")}
                </fieldset>
              )}

              <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
                <legend className="flex gap-2 px-1 font-semibold text-small">
                  {t("drawer.conditionLegend")}
                  <OptionalMark />
                </legend>
                <p className="text-muted-foreground text-tiny">{t("drawer.conditionHint")}</p>
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-small">{t("drawer.conditionTypes")}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {eventTypes.map((type) => (
                      <label key={type.key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-(--primary)"
                          checked={form.eventTypeKeys.includes(type.key)}
                          disabled={disabled}
                          onChange={() =>
                            set({ eventTypeKeys: toggle(form.eventTypeKeys, type.key) })
                          }
                        />
                        {type.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-small">{t("drawer.conditionVenues")}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {VENUE_KINDS.map((kind) => (
                      <label key={kind} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-(--primary)"
                          checked={form.venueKinds.includes(kind)}
                          disabled={disabled}
                          onChange={() => set({ venueKinds: toggle(form.venueKinds, kind) })}
                        />
                        {t(`venueKinds.${kind}`)}
                      </label>
                    ))}
                  </div>
                </div>
                {form.venueIds.length > 0 && (
                  <p className="text-muted-foreground text-tiny">
                    {t("drawer.conditionVenueIds", { count: form.venueIds.length })}
                  </p>
                )}
              </fieldset>

              {error && !error.field && (
                <p role="alert" className="text-small text-status-critical">
                  {error.text}
                </p>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-border-subtle border-t px-5 py-3">
              {!editable ? (
                <span className="text-muted-foreground text-tiny">{t("drawer.readOnly")}</span>
              ) : (
                <span className="text-muted-foreground text-tiny">{t("drawer.draftHint")}</span>
              )}
              <span className="flex gap-2">
                <Button disabled={pending} onClick={close}>
                  {editable ? t("drawer.cancel") : t("drawer.close")}
                </Button>
                {editable && (
                  <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
                    {item ? t("drawer.save") : t("drawer.add")}
                  </Button>
                )}
              </span>
            </footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
