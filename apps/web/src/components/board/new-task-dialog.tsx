"use client";

import { CircleAlert, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { makeTask } from "@/app/(app)/board/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDateShortYear, formatMonth } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { TASK_CATEGORIES } from "@/lib/task-ui";
import type { EventOption, StaffOption } from "@/server/queries/tasks";
import { useDrawerHrefs } from "./use-task-actions";

type Category = (typeof TASK_CATEGORIES)[number];

/** The one error shown in the form: its text and the field it is about (that field gets focus). */
type FormError = { text: string; field: "title" | "hours" | null };

/**
 * "+ Aufgabe" (shortcut C): a manual task on an event or without one. Seven fields, so a modal
 * (UX concept §4); opens the new task in the drawer afterwards. The event defaults to the one in
 * context: `?veranstaltung=<id>` (the top bar's "+ Neu" on a market page) or the open market panel
 * (`?markt=<id>`). Required is the default, optional fields say so; one error, shown in one place.
 */
export function NewTaskButton({
  eventId,
  events,
  staff,
  canAssign,
  today,
}: {
  /** Fixed event (event board). */
  eventId?: string;
  /** Choice of events (board across events). */
  events?: EventOption[];
  staff: StaffOption[];
  canAssign: boolean;
  today: string;
}) {
  const t = useTranslations("tasks.create");
  const tCat = useTranslations("tasks.categories");
  const locale = useLocale();
  const { showToast } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const drawer = useDrawerHrefs();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<FormError | null>(null);
  const [title, setTitle] = useState("");
  const [forEvent, setForEvent] = useState(eventId ?? "");
  const [due, setDue] = useState("");
  const [hours, setHours] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [assignee, setAssignee] = useState("");
  const [description, setDescription] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const hoursRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  // Events grouped by month, in date order (the query sorts them), each labelled "Name · Sa 31.10.".
  const groups = useMemo(() => {
    const byMonth = new Map<string, { label: string; items: { id: string; label: string }[] }>();
    for (const e of events ?? []) {
      const key = e.startsOn.slice(0, 7);
      const group = byMonth.get(key) ?? { label: formatMonth(e.startsOn, locale), items: [] };
      group.items.push({
        id: e.id,
        label: `${e.name} · ${formatDateShortYear(e.startsOn, locale, today)}`,
      });
      byMonth.set(key, group);
    }
    return [...byMonth.values()];
  }, [events, locale, today]);

  /** The event the person is looking at, when it can take a task. */
  function contextEvent(search: URLSearchParams): string {
    const wanted = search.get("veranstaltung") ?? search.get("markt");
    return wanted && (events ?? []).some((e) => e.id === wanted) ? wanted : "";
  }

  function openDialog(search: URLSearchParams = params) {
    setForEvent(eventId ?? contextEvent(search));
    setOpen(true);
  }

  // "+ Neu › Aufgabe" in the top bar links here with ?neu=1 (and ?veranstaltung=<id>); both parameters are
  // dropped again so reload and back do not reopen it.
  const requested = params.get("neu") === "1";
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the request itself should re-run this
  useEffect(() => {
    if (!requested) return;
    openDialog(params);
    const rest = new URLSearchParams(params);
    rest.delete("neu");
    rest.delete("veranstaltung");
    const query = rest.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
  }, [requested]);

  // The "C" shortcut calls the latest `openDialog` (it reads the current events and URL).
  const openRef = useRef(openDialog);
  openRef.current = openDialog;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      event.preventDefault();
      openRef.current(new URLSearchParams(window.location.search));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function reset() {
    setTitle("");
    setDue("");
    setHours("");
    setCategory("general");
    setAssignee("");
    setDescription("");
    setError(null);
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    // Cancel or Esc: the next dialog starts clean.
    if (!next) reset();
  }

  function fail(text: string, field: FormError["field"]) {
    setError({ text, field });
    (field === "title" ? titleRef : field === "hours" ? hoursRef : null)?.current?.focus();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const minutes = hours.trim() === "" ? 0 : Math.round(Number(hours.replace(",", ".")) * 60);
    if (!title.trim()) return fail(t("errors.title_required"), "title");
    if (!Number.isFinite(minutes) || minutes < 0) return fail(t("errors.hours_invalid"), "hours");
    setError(null);
    startTransition(async () => {
      const result = await makeTask({
        title,
        eventId: forEvent || null,
        dueOn: due || null,
        estimateMinutes: minutes,
        category,
        description: description || null,
        assigneeId: canAssign && assignee ? assignee : null,
      });
      if (!result.ok) {
        setError({
          text: t.has(`errors.${result.error}` as never)
            ? t(`errors.${result.error}` as never)
            : t("errors.generic"),
          field: null,
        });
        return;
      }
      setOpen(false);
      reset();
      showToast({ message: t("created", { title: title.trim() }) });
      router.push(drawer.open(result.data.id) as never);
    });
  }

  const pastDue = due !== "" && due < today;

  return (
    <>
      <Button variant="default" onClick={() => openDialog()}>
        <Plus aria-hidden />
        {t("button")}
        <Kbd className="border-white/40 bg-transparent text-inherit">C</Kbd>
      </Button>
      <Modal open={open} onOpenChange={changeOpen} title={t("title")} closeLabel={t("cancel")}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-title`}>{t("fields.title")}</Label>
            <Input
              ref={titleRef}
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
              aria-invalid={error?.field === "title" || undefined}
              aria-describedby={error?.field === "title" ? `${uid}-error` : undefined}
            />
          </div>
          {!eventId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-event`} optional>
                {t("fields.event")}
              </Label>
              <select
                id={`${uid}-event`}
                value={forEvent}
                onChange={(e) => setForEvent(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">{t("noEvent")}</option>
                {groups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-due`} optional>
                {t("fields.due")}
              </Label>
              <Input
                id={`${uid}-due`}
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                aria-describedby={pastDue ? `${uid}-due-hint` : undefined}
              />
              {pastDue && (
                <p
                  id={`${uid}-due-hint`}
                  className="flex items-start gap-1.5 text-status-warn text-tiny"
                >
                  <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  {t("duePast")}
                </p>
              )}
            </div>
            {isModuleVisible("estimates") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-hours`} optional>
                  {t("fields.hours")}
                </Label>
                <Input
                  ref={hoursRef}
                  id={`${uid}-hours`}
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="1,5"
                  aria-invalid={error?.field === "hours" || undefined}
                  aria-describedby={error?.field === "hours" ? `${uid}-error` : undefined}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-cat`}>{t("fields.category")}</Label>
              <select
                id={`${uid}-cat`}
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className={SELECT_CLASS}
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tCat(c)}
                  </option>
                ))}
              </select>
            </div>
            {canAssign && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-who`} optional>
                  {t("fields.assignee")}
                </Label>
                <select
                  id={`${uid}-who`}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">{t("nobody")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-desc`} optional>
              {t("fields.description")}
            </Label>
            <textarea
              id={`${uid}-desc`}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              className={TEXTAREA_CLASS}
            />
          </div>
          {error && (
            <p id={`${uid}-error`} role="alert" className="text-small text-status-critical">
              {error.text}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => changeOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" disabled={pending} aria-busy={pending}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
