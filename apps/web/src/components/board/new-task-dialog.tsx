"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { makeTask } from "@/app/(app)/board/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { useOpenOnNew } from "@/components/shell/use-new-param";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { TASK_CATEGORIES } from "@/lib/task-ui";
import type { EventOption, StaffOption } from "@/server/queries/tasks";
import { useDrawerHrefs } from "./use-task-actions";

type Category = (typeof TASK_CATEGORIES)[number];

/**
 * "+ Aufgabe" (shortcut C): a manual task on an event or without one. Seven fields, so a modal
 * (UX concept §4); opens the new task in the drawer afterwards.
 */
export function NewTaskButton({
  eventId,
  events,
  staff,
  canAssign,
}: {
  /** Fixed event (event board). */
  eventId?: string;
  /** Choice of events (board across events). */
  events?: EventOption[];
  staff: StaffOption[];
  canAssign: boolean;
}) {
  const t = useTranslations("tasks.create");
  const tCat = useTranslations("tasks.categories");
  const { showToast } = useShell();
  const router = useRouter();
  const drawer = useDrawerHrefs();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [forEvent, setForEvent] = useState(eventId ?? "");
  const [due, setDue] = useState("");
  const [hours, setHours] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [assignee, setAssignee] = useState("");
  const [description, setDescription] = useState("");
  const uid = useId();

  // "+ Neu › Aufgabe" in the top bar links here with ?neu=1.
  useOpenOnNew(() => setOpen(true));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      event.preventDefault();
      setOpen(true);
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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const minutes = hours.trim() === "" ? 0 : Math.round(Number(hours.replace(",", ".")) * 60);
    if (!title.trim() || !Number.isFinite(minutes) || minutes < 0) {
      setError(t("errors.invalid_input"));
      return;
    }
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
        setError(
          t.has(`errors.${result.error}` as never)
            ? t(`errors.${result.error}` as never)
            : t("errors.generic"),
        );
        return;
      }
      setOpen(false);
      reset();
      showToast({ message: t("created", { title: title.trim() }) });
      router.push(drawer.open(result.data.id) as never);
    });
  }

  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {t("button")}
        <Kbd className="border-white/40 bg-transparent text-inherit">C</Kbd>
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={t("title")} closeLabel={t("cancel")}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-title`}>{t("fields.title")}</Label>
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </div>
          {!eventId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-event`}>{t("fields.event")}</Label>
              <select
                id={`${uid}-event`}
                value={forEvent}
                onChange={(e) => setForEvent(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">{t("noEvent")}</option>
                {(events ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-due`}>{t("fields.due")}</Label>
              <Input
                id={`${uid}-due`}
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-hours`}>{t("fields.hours")}</Label>
              <Input
                id={`${uid}-hours`}
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="1,5"
              />
            </div>
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
                <Label htmlFor={`${uid}-who`}>{t("fields.assignee")}</Label>
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
            <Label htmlFor={`${uid}-desc`}>{t("fields.description")}</Label>
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
            <p role="alert" className="text-small text-status-critical">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>
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
