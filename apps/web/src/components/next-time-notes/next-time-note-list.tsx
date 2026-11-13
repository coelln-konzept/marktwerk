"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setNextTimeNoteDoneAction } from "@/app/(app)/next-time-notes-actions";
import { useShell } from "@/components/shell/shell-context";
import { TickMark } from "@/components/task/task-tick";
import { callAction } from "@/lib/call-action";
import { formatDate, formatDateWithWeekday, todayIn } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NextTimeNoteRow } from "@/server/queries/next-time-notes";
import { useNoteErrorText } from "./next-time-note-form";

/** A note's text cut for a toast. */
const short = (text: string) => (text.length > 60 ? `${text.slice(0, 60).trimEnd()} …` : text);

/** The Berlin calendar day of an ISO instant. */
const dayOf = (iso: string) => todayIn("Europe/Berlin", new Date(iso));

/**
 * The notes of a market (Fahrplan R25): open ones as rows with the shared tick (a click marks the note done,
 * undo toast), the done ones folded into "› Erledigt (n)" where a click on the filled tick reopens. Optimistic:
 * a ticked note moves at once and goes back if the server refuses. Without `done` (Zusammenfassung, "Markt
 * planen") there is no fold: a ticked note leaves the list and only the toast brings it back. `showOrigin` = the
 * meta line names the date (and task) a note was written at.
 */
export function NextTimeNoteList({
  open,
  done: doneProp,
  doneCount: doneCountProp,
  canWrite,
  showOrigin = true,
  emptyText,
  className,
}: {
  open: NextTimeNoteRow[];
  done?: NextTimeNoteRow[];
  doneCount?: number;
  canWrite: boolean;
  showOrigin?: boolean;
  /** Text when nothing is open; null renders nothing then. */
  emptyText?: string | null;
  className?: string;
}) {
  const t = useTranslations("nextTimeNotes");
  const errorText = useNoteErrorText();
  const { showToast, showError } = useShell();
  const [, startTransition] = useTransition();
  const showDone = doneProp !== undefined;
  const done = doneProp ?? [];
  const doneCount = doneCountProp ?? done.length;
  /** Local state over the server's until the next refresh: id → done. */
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const isDone = (n: NextTimeNoteRow) => override[n.id] ?? n.doneAt !== null;
  const all = [...open, ...done.filter((d) => !open.some((o) => o.id === d.id))];
  const openRows = all.filter((n) => !isDone(n));
  // Lists without a done part (Zusammenfassung, "Markt planen") let a ticked note go; the toast brings it back.
  const doneRows = showDone ? all.filter(isDone) : [];
  const hiddenDone = Math.max(0, doneCount - done.length);

  function toggle(note: NextTimeNoteRow, toDone: boolean) {
    setOverride((o) => ({ ...o, [note.id]: toDone }));
    setBusy((b) => new Set(b).add(note.id));
    startTransition(async () => {
      const result = await callAction(() => setNextTimeNoteDoneAction(note.id, toDone));
      setBusy((b) => {
        const next = new Set(b);
        next.delete(note.id);
        return next;
      });
      if (!result.ok) {
        setOverride((o) => ({ ...o, [note.id]: !toDone }));
        showError(errorText(result.error));
        return;
      }
      showToast({
        message: t(toDone ? "toast.done" : "toast.reopened", { text: short(note.body) }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          setOverride((o) => ({ ...o, [note.id]: !toDone }));
          const undone = await callAction(() => setNextTimeNoteDoneAction(note.id, !toDone));
          if (!undone.ok) {
            setOverride((o) => ({ ...o, [note.id]: toDone }));
            showError(errorText(undone.error));
          }
        },
      });
    });
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {openRows.length === 0
        ? emptyText !== null && (
            <p className="m-0 px-4 py-3 text-muted-foreground text-small">
              {emptyText ?? t("empty")}
            </p>
          )
        : null}
      {openRows.length > 0 && (
        <ul className="m-0 list-none p-0">
          {openRows.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              done={false}
              canWrite={canWrite}
              busy={busy.has(n.id)}
              showOrigin={showOrigin}
              onToggle={() => toggle(n, true)}
            />
          ))}
        </ul>
      )}
      {doneRows.length > 0 && (
        <details className="group border-border-subtle border-t">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 py-2 font-medium text-foreground-2 text-small focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            />
            {t("doneToggle", { count: doneRows.length + hiddenDone })}
          </summary>
          <ul className="m-0 list-none p-0">
            {doneRows.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                done
                canWrite={canWrite}
                busy={busy.has(n.id)}
                showOrigin={showOrigin}
                onToggle={() => toggle(n, false)}
              />
            ))}
          </ul>
          {hiddenDone > 0 && (
            <p className="m-0 px-4 pb-3 text-muted-foreground text-small">
              {t("doneMore", { shown: done.length, count: doneCount })}
            </p>
          )}
        </details>
      )}
    </div>
  );
}

function NoteRow({
  note,
  done,
  canWrite,
  busy,
  showOrigin,
  onToggle,
}: {
  note: NextTimeNoteRow;
  done: boolean;
  canWrite: boolean;
  busy: boolean;
  showOrigin: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("nextTimeNotes");
  const locale = useLocale();
  const author = note.authorName ?? t("meta.unknownAuthor");
  const parts: React.ReactNode[] = [
    author,
    t("meta.written", { date: formatDate(dayOf(note.createdAt), locale) }),
  ];
  if (showOrigin) {
    if (note.event) {
      const label = t("meta.atDate", {
        date: formatDateWithWeekday(note.event.startsOn, locale),
      });
      parts.push(
        note.event.archived ? (
          label
        ) : (
          <Link
            key="event"
            href={`/veranstaltungen/${note.event.id}` as never}
            className="text-accent-soft-foreground hover:underline"
          >
            {label}
          </Link>
        ),
      );
    } else parts.push(t("meta.marketPage"));
  }
  if (note.taskTitle) parts.push(t("meta.task", { title: note.taskTitle }));
  if (done && note.doneAt) {
    const date = formatDate(dayOf(note.doneAt), locale);
    parts.push(
      note.doneByName
        ? t("meta.done", { date, name: note.doneByName })
        : t("meta.doneNoName", { date }),
    );
  }

  return (
    <li className="flex items-start gap-2 border-border-subtle border-b px-3 py-2 last:border-b-0">
      {canWrite ? (
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          aria-pressed={done}
          aria-label={
            done
              ? t("reopenAria", { text: short(note.body) })
              : t("doneAria", { text: short(note.body) })
          }
          title={done ? t("reopen") : t("markDone")}
          className="group/tick grid size-7 shrink-0 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60 touch:size-10"
        >
          <TickMark status={done ? "done" : "todo"} />
        </button>
      ) : (
        <span className="grid size-7 shrink-0 place-items-center">
          <TickMark status={done ? "done" : "todo"} />
        </span>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <p
          className={cn(
            "m-0 whitespace-pre-line break-words",
            done ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {note.body}
        </p>
        <p className="m-0 mt-0.5 text-muted-foreground text-small">
          {parts.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed order of meta parts
            <span key={i}>
              {i > 0 && " · "}
              {p}
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}
