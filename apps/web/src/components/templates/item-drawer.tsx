"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  anchorFitsScope,
  checkTemplateItem,
  defaultAnchors,
  dueDateForNrw,
  type ItemCondition,
  insertPoint,
  isSeasonAnchorKey,
  normalizeCondition,
  PERMIT_TYPES,
  SEASON_ANCHOR_KEYS,
  STANDARD_ANCHOR_KEYS,
  TEMPLATE_ITEM_SCOPES,
  type TemplateItemFields,
  type TemplateItemScope,
} from "@marktwerk/core";
import { ArrowDown, ArrowUp, CornerLeftUp, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type MouseEvent, useRef, useState, useTransition } from "react";
import {
  addItemAction,
  deleteItemAction,
  moveItemAction,
  restoreItemsAction,
  updateItemAction,
} from "@/app/(app)/vorlagen/ablauf/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { formatDateWithWeekday } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
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
  /** Child item (ADR 0021): the key of its parent item; null = top-level. */
  parentKey: string | null;
  /** Child item: own anchor/offset/day mode/time instead of the parent's. */
  ownDue: boolean;
  /** "Gilt für" (research 13 §6.1): every date of the market, or once per season. A child item takes its parent's. */
  scope: TemplateItemScope;
  eventTypeKeys: string[];
  venueKinds: string[];
  venueIds: string[];
};

const DEFAULT_OFFSET: Record<TemplateItemFields["phase"], string> = {
  pre: "-7",
  live: "0",
  post: "1",
};

/** The anchor a row gets when it switches to a scope its current anchor does not fit. */
const SCOPE_ANCHOR: Record<TemplateItemScope, string> = {
  event: "event_day",
  season: "season_start",
};

function initialForm(
  item: ItemView | null,
  phase: TemplateItemFields["phase"],
  scope: TemplateItemScope = "event",
): Form {
  if (!item)
    return {
      title: "",
      description: "",
      phase,
      category: "general",
      anchorKey: SCOPE_ANCHOR[scope],
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
      parentKey: null,
      ownDue: false,
      scope,
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
    parentKey: item.parentKey,
    ownDue: item.ownDue,
    scope: item.scope ?? "event",
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
    approverDutyRoleId: form.approverDutyRoleId || null,
    parentKey: form.parentKey,
    ownDue: form.ownDue,
    scope: form.scope,
    condition: normalizeCondition(condition),
  };
}

/** A new child item: just a title; it inherits the parent's due date and role (ADR 0021). */
function newChildFields(parent: ItemView, title: string): TemplateItemFields {
  const { key, ...fields } = parent;
  return {
    ...fields,
    title,
    description: null,
    parentKey: key,
    ownDue: false,
    dutyRoleId: null,
    approverDutyRoleId: null,
    priority: "normal",
    estimateMinutes: 0,
    requiresPhoto: false,
    requiresNote: false,
    requiresAttachment: false,
    isKey: false,
    permitType: null,
    condition: null,
  };
}

/**
 * Detail drawer for one row of a template version (UX concept §4: real work on one record while the list
 * stays visible; addressed as `?zeile=<key>`, `?zeile=neu&phase=pre` for a new row). Editable only in the
 * draft; published versions show the same fields read-only. A top-level row lists its child items
 * ("Unteraufgaben", ADR 0021): add by title, open, reorder, remove (with undo). A child item opens in the same
 * drawer and inherits the parent's due date ("Eigene Fälligkeit" off) and role ("Wie Hauptaufgabe").
 * "Gilt für" (research 13 §6.1) makes a top-level row a season row ("Ganze Saison": once per season, due from
 * Saisonbeginn or Saisonende) or a row of every date; child rows take their parent's and show no choice.
 */
export function ItemDrawer({
  versionId,
  editable,
  item,
  newPhase,
  newScope = "event",
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
  /** Scope of a new row (`?gilt=saison` from the grid's Saison section). */
  newScope?: TemplateItemScope;
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
  const { showToast, showError: showErrorToast } = useShell();
  const [form, setForm] = useState(() => initialForm(item, newPhase, newScope));
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [childPending, startChildTransition] = useTransition();
  const [childTitle, setChildTitle] = useState("");
  const [childError, setChildError] = useState<string | null>(null);
  const childInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const disabled = !editable || pending;

  // Child items (ADR 0021): one level. A row with children can't become a child; a child has no children.
  const parent = form.parentKey ? items.find((i) => i.key === form.parentKey) : undefined;
  const isChild = form.parentKey !== null;
  const children = item ? items.filter((i) => i.parentKey === item.key) : [];
  const parentChoices = items.filter((i) => i.parentKey === null && i.key !== item?.key);
  const showChildren = item !== null && item.parentKey === null && !isChild;
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const rowHref = (key: string) => `${closeHref}&zeile=${encodeURIComponent(key)}`;

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const close = () => router.replace(closeHref as never, { scroll: false });
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const season = form.scope === "season";
  // Season rows hang only on the season anchors, rows of every date never on them (core `anchorFitsScope`).
  const anchorOptions = season
    ? [...new Set<string>([...SEASON_ANCHOR_KEYS, form.anchorKey])]
    : [
        ...new Set([
          ...STANDARD_ANCHOR_KEYS,
          ...extraAnchors.filter((key) => !isSeasonAnchorKey(key)),
          form.anchorKey,
        ]),
      ];
  const anchorName = (key: string) =>
    t.has(`anchors.${key}` as never) ? t(`anchors.${key}` as never) : key;

  const fields = toFields(form);
  const issues = checkTemplateItem(fields);
  const issue = issues[0];
  // The offset is checked while typing ("abc", -9999), not only on "Speichern"; an empty field waits for saving.
  const offsetIssue =
    form.offsetDays.trim() === ""
      ? undefined
      : issues.find((i) => i.field === "offsetDays" && i.code === "invalid_offset");
  const dirty =
    editable &&
    JSON.stringify(fields) !== JSON.stringify(toFields(initialForm(item, newPhase, newScope)));

  /** Going to another row (a child, the parent) would drop the typed changes: ask to save first. */
  function guard(event: MouseEvent) {
    if (!dirty) return;
    event.preventDefault();
    setNotice(t("drawer.children.saveFirst"));
  }

  /** The parent's schedule as form values (what an inheriting child is due by). */
  const parentDue = (p: ItemView) => ({
    anchorKey: p.anchorKey,
    offsetDays: String(p.offsetDays),
    dayMode: p.dayMode,
    dueTime: p.dueTime ?? "",
  });

  /** "Gilt für": an anchor that does not fit the new scope moves to the scope's main anchor. */
  function chooseScope(scope: TemplateItemScope) {
    set(
      anchorFitsScope(scope, form.anchorKey)
        ? { scope }
        : { scope, anchorKey: SCOPE_ANCHOR[scope] },
    );
  }

  function chooseParent(key: string) {
    const next = key ? items.find((i) => i.key === key) : undefined;
    const nextScope = next?.scope ?? "event";
    // A child stands in its parent's phase and scope (the service keeps it so as well); an own date that does
    // not fit the parent's scope starts again from the parent's.
    if (next)
      set({
        parentKey: next.key,
        phase: next.phase,
        scope: nextScope,
        ...(form.ownDue && !anchorFitsScope(nextScope, form.anchorKey) ? parentDue(next) : {}),
      });
    // An inheriting child that becomes standalone keeps what it was due by and assigned to so far.
    else if (parent && !form.ownDue)
      set({
        parentKey: null,
        ...parentDue(parent),
        dutyRoleId: form.dutyRoleId || (parent.dutyRoleId ?? ""),
      });
    else set({ parentKey: null, dutyRoleId: form.dutyRoleId || (parent?.dutyRoleId ?? "") });
  }

  /**
   * "Eigene Fälligkeit": starts from the parent's schedule, so nothing jumps when it is ticked (a child that had
   * its own schedule already keeps it).
   */
  function chooseOwnDue(own: boolean) {
    set(own && parent && !item?.ownDue ? { ownDue: true, ...parentDue(parent) } : { ownDue: own });
  }

  function addChild() {
    if (!item) return;
    setChildError(null);
    const title = childTitle.trim().replace(/\s+/g, " ");
    const childFields = newChildFields(item, title);
    const childIssue = checkTemplateItem(childFields)[0];
    if (childIssue) {
      setChildError(errorText(childIssue.code));
      childInput.current?.focus();
      return;
    }
    const afterKey = children.at(-1)?.key ?? item.key;
    startChildTransition(async () => {
      const result = await addItemAction(versionId, childFields, afterKey);
      if (!result.ok) {
        setChildError(errorText(result.error));
        return;
      }
      setChildTitle("");
      childInput.current?.focus();
      showToast({ message: t("drawer.children.added", { title }) });
    });
  }

  function moveChild(child: ItemView, direction: "up" | "down") {
    setChildError(null);
    startChildTransition(async () => {
      const result = await moveItemAction(versionId, child.key, direction);
      if (!result.ok) setChildError(errorText(result.error));
    });
  }

  /**
   * Removes a child item; the toast puts it back at the same place with its own key, so the tasks of existing
   * events still match it (undo over a confirmation).
   */
  function removeChild(child: ItemView) {
    setChildError(null);
    const index = items.findIndex((i) => i.key === child.key);
    const beforeKey = items[index + 1]?.key ?? null;
    const afterKey = items[index - 1]?.key ?? null;
    startChildTransition(async () => {
      const result = await deleteItemAction(versionId, child.key);
      if (!result.ok) {
        setChildError(errorText(result.error));
        return;
      }
      showToast({
        message: t("drawer.children.removed", { title: child.title }),
        actionLabel: t("drawer.children.undo"),
        onAction: async () => {
          const back = await restoreItemsAction(versionId, [child], afterKey, beforeKey);
          if (!back.ok) showErrorToast(errorText(back.error));
        },
      });
    });
  }
  const showError = error?.field ?? (error ? "form" : undefined);

  // "Beispiel": when this row would be due for a one-day event on the sample day (a season row: for a season
  // that starts or ends on that day).
  const anchors = new Map<string, string>(
    season
      ? SEASON_ANCHOR_KEYS.map((key) => [key, exampleDay])
      : Object.entries(defaultAnchors(exampleDay, 1)),
  );
  const anchorDay = anchors.get(form.anchorKey);
  const example =
    anchorDay && Number.isInteger(fields.offsetDays)
      ? dueDateForNrw(anchorDay, fields.offsetDays, form.dayMode)
      : null;

  // A new row goes where its due date puts it, so the phase stays in order (A7-05). Season rows stand in one
  // section of their own, whatever their phase.
  const offsetDays = Number.isInteger(fields.offsetDays) ? fields.offsetDays : 0;
  const point = season
    ? insertPoint(
        items
          .filter((i) => i.scope === "season" && i.parentKey === null)
          .map((i) => ({ ...i, phase: "pre" as const })),
        { phase: "pre", anchorKey: form.anchorKey, offsetDays },
      )
    : insertPoint(
        items.filter((i) => (i.scope ?? "event") === "event"),
        { phase: form.phase, anchorKey: form.anchorKey, offsetDays },
      );

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
              {item?.parentKey && parent && (
                <Link
                  href={rowHref(parent.key) as never}
                  scroll={false}
                  onClick={guard}
                  aria-label={t("drawer.openParent", { title: parent.title })}
                  className="mt-0.5 inline-flex items-center gap-1 text-accent-soft-foreground text-small hover:underline"
                >
                  <CornerLeftUp aria-hidden className="size-3.5" />
                  {t("drawer.childOf", { title: parent.title })}
                </Link>
              )}
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
              {notice && (
                <p
                  role="alert"
                  className="rounded-md bg-status-warn-bg px-3 py-2 text-small text-status-warn"
                >
                  {notice}
                </p>
              )}
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

              {children.length > 0
                ? editable && (
                    <p className="text-muted-foreground text-tiny">{t("drawer.hasChildrenHint")}</p>
                  )
                : (editable || isChild) && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="item-parent">{t("drawer.parent")}</Label>
                      <select
                        id="item-parent"
                        className={SELECT_CLASS}
                        value={form.parentKey ?? ""}
                        disabled={disabled}
                        aria-invalid={invalid("parentKey")}
                        onChange={(e) => chooseParent(e.target.value)}
                      >
                        <option value="">{t("drawer.standalone")}</option>
                        {form.parentKey && !parent && (
                          <option value={form.parentKey}>{form.parentKey}</option>
                        )}
                        {parentChoices.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      {fieldError("parentKey")}
                      <p className="text-muted-foreground text-tiny">
                        {parent?.scope === "season"
                          ? t("drawer.parentHintSeason")
                          : t("drawer.parentHint")}
                      </p>
                    </div>
                  )}

              {isChild ? (
                parent?.scope === "season" && (
                  <p className="text-muted-foreground text-tiny">{t("drawer.scopeInherited")}</p>
                )
              ) : (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 font-semibold text-small">{t("drawer.scope")}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATE_ITEM_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className={cn(
                          "flex min-h-(--control-h) items-center gap-2 rounded-lg border px-3 py-1.5",
                          !disabled && "cursor-pointer hover:bg-hover",
                          form.scope === scope && "border-primary bg-selected",
                        )}
                      >
                        <input
                          type="radio"
                          name="item-scope"
                          value={scope}
                          className="size-4 accent-(--primary)"
                          checked={form.scope === scope}
                          disabled={disabled}
                          aria-invalid={invalid("scope")}
                          onChange={() => chooseScope(scope)}
                        />
                        <span className="font-medium">{t(`drawer.scopes.${scope}`)}</span>
                      </label>
                    ))}
                  </div>
                  {fieldError("scope")}
                  <p className="text-muted-foreground text-tiny">{t("drawer.scopeHint")}</p>
                </fieldset>
              )}

              {showChildren && (
                <section
                  aria-labelledby="item-children-title"
                  className="flex flex-col gap-2 rounded-lg border p-3"
                >
                  <h3 id="item-children-title" className="font-semibold text-small">
                    {t("drawer.children.legend")}
                    {children.length > 0 && (
                      <span className="tabular ml-1.5 font-normal text-muted-foreground">
                        {children.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-muted-foreground text-tiny">{t("drawer.children.hint")}</p>
                  {children.length === 0 ? (
                    <p className="text-muted-foreground text-small">{t("drawer.children.empty")}</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border-subtle">
                      {children.map((child, index) => (
                        <li key={child.key} className="flex items-center gap-2 py-1.5">
                          <span className="flex min-w-0 flex-1 flex-col">
                            <Link
                              href={rowHref(child.key) as never}
                              scroll={false}
                              onClick={guard}
                              aria-label={t("drawer.children.edit", { title: child.title })}
                              className="truncate font-medium text-accent-soft-foreground hover:underline"
                            >
                              {child.title}
                            </Link>
                            {(child.dutyRoleId || child.ownDue) && (
                              <span className="tabular text-muted-foreground text-tiny">
                                {[
                                  child.dutyRoleId ? (roleName.get(child.dutyRoleId) ?? "?") : null,
                                  child.ownDue
                                    ? t("drawer.children.ownDue", {
                                        text: offsetText.full(child.offsetDays, child.dayMode),
                                      })
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </span>
                          {editable && (
                            <span className="flex shrink-0 gap-1">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("drawer.children.up", { title: child.title })}
                                disabled={childPending || index === 0}
                                onClick={() => moveChild(child, "up")}
                              >
                                <ArrowUp aria-hidden />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("drawer.children.down", { title: child.title })}
                                disabled={childPending || index === children.length - 1}
                                onClick={() => moveChild(child, "down")}
                              >
                                <ArrowDown aria-hidden />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("drawer.children.remove", { title: child.title })}
                                disabled={childPending}
                                onClick={() => removeChild(child)}
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {editable && (
                    <div className="flex gap-2">
                      <Input
                        ref={childInput}
                        value={childTitle}
                        maxLength={200}
                        aria-label={t("drawer.children.newLabel")}
                        placeholder={t("drawer.children.newPlaceholder")}
                        disabled={childPending}
                        aria-invalid={childError !== null}
                        onChange={(e) => setChildTitle(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter adds the child here instead of saving the whole row.
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            addChild();
                          }
                        }}
                      />
                      <Button aria-busy={childPending} disabled={childPending} onClick={addChild}>
                        <Plus aria-hidden />
                        {t("drawer.children.add")}
                      </Button>
                    </div>
                  )}
                  {childError && (
                    <p role="alert" className="text-small text-status-critical">
                      {childError}
                    </p>
                  )}
                </section>
              )}
              {item === null && !isChild && editable && (
                <p className="text-muted-foreground text-tiny">
                  {t("drawer.children.newItemHint")}
                </p>
              )}

              <div className={cn("grid gap-3", !isChild && "grid-cols-2")}>
                {!isChild && (
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
                )}
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

              {isModuleVisible("keyTasks") && (
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
              )}

              {isChild && (
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 font-semibold text-small">
                    <input
                      type="checkbox"
                      className="size-4 accent-(--primary)"
                      checked={form.ownDue}
                      disabled={disabled}
                      onChange={(e) => chooseOwnDue(e.target.checked)}
                    />
                    {t("drawer.ownDue")}
                  </label>
                  <p className="text-muted-foreground text-tiny">{t("drawer.ownDueHint")}</p>
                  {!form.ownDue && parent && (
                    <p className="tabular rounded-md bg-sunken px-3 py-2 text-small">
                      {t("drawer.inheritedDue", {
                        text: `${offsetText.full(parent.offsetDays, parent.dayMode)} · ${anchorName(parent.anchorKey)}`,
                      })}
                    </p>
                  )}
                </div>
              )}

              {(!isChild || form.ownDue) && (
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
                        aria-invalid={invalid("offsetDays") || offsetIssue !== undefined}
                        aria-describedby={offsetIssue ? "item-offset-error" : undefined}
                        onChange={(e) => set({ offsetDays: e.target.value })}
                      />
                    </div>
                  </div>
                  {fieldError("anchorKey")}
                  {offsetIssue && error?.field !== "offsetDays" ? (
                    <p id="item-offset-error" className="text-small text-status-critical">
                      {errorText(offsetIssue.code)}
                    </p>
                  ) : (
                    fieldError("offsetDays")
                  )}
                  {offsetIssue === undefined && Number.isInteger(fields.offsetDays) && (
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
                    {!example
                      ? t("drawer.exampleNone")
                      : season
                        ? t("drawer.exampleSeason", {
                            anchor: anchorName(form.anchorKey),
                            day: formatDateWithWeekday(exampleDay, locale),
                            due: formatDateWithWeekday(example, locale),
                          })
                        : t("drawer.example", {
                            day: formatDateWithWeekday(exampleDay, locale),
                            due: formatDateWithWeekday(example, locale),
                          })}
                  </p>
                  {form.anchorKey === "season_end" && (
                    <p className="text-muted-foreground text-tiny">
                      {t("drawer.exampleSeasonEnd")}
                    </p>
                  )}
                </fieldset>
              )}

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
                    <option value="">
                      {isChild ? t("drawer.roleAsParent") : t("drawer.noRole")}
                    </option>
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
              <p className="-mt-2 text-muted-foreground text-tiny">
                {season ? t("drawer.roleHintSeason") : t("drawer.roleHint")}
              </p>

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

              <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
                <legend className="flex gap-2 px-1 font-semibold text-small">
                  {t("drawer.conditionLegend")}
                  <OptionalMark />
                </legend>
                <p className="text-muted-foreground text-tiny">
                  {season ? t("drawer.conditionHintSeason") : t("drawer.conditionHint")}
                </p>
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
