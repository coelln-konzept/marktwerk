"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatInstant } from "@/components/event-detail/format-instant";
import { formatDateWeekdayDay } from "@/lib/format";
import type { TaskDetail } from "@/server/queries/tasks";

type Entry = TaskDetail["activity"][number];
type Diff = {
  column?: string;
  from?: string;
  to?: string;
  fromName?: string | null;
  toName?: string | null;
  note?: string;
  until?: string;
  op?: string;
  title?: string;
  ofAction?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

const asDiff = (value: unknown): Diff =>
  value && typeof value === "object" ? (value as Diff) : {};

/** The task's audit entries in plain words, newest first (UX concept: "Aktivität" in the drawer). */
export function TaskActivity({ entries }: { entries: Entry[] }) {
  const t = useTranslations("tasks.activity");
  const tStatus = useTranslations("tasks.status");
  const tBoard = useTranslations("board.columns");
  const tFields = useTranslations("tasks.fields");
  const locale = useLocale();
  const who = (e: Entry) => e.actorName ?? t("someone");
  const status = (key: string | undefined) =>
    key && tStatus.has(key as never) ? tStatus(key as never) : (key ?? "?");
  const column = (key: string | undefined) =>
    key && tBoard.has(key as never) ? tBoard(key as never) : (key ?? "?");

  function describe(e: Entry): string {
    const d = asDiff(e.diff);
    const name = who(e);
    switch (e.action) {
      case "task.create":
        return t("create", { name });
      case "task.move": {
        const after = d.after ?? {};
        const before = d.before ?? {};
        if (after.status === "done") return t("moveDone", { name });
        if (before.status === "done" || before.status === "skipped")
          return t("reopen", { name, column: column(d.column) });
        return t("move", { name, column: column(d.column) });
      }
      case "task.assign":
        if (!d.toName) return t("unassign", { name, from: d.fromName ?? "?" });
        if (!d.fromName) return t("assign", { name, to: d.toName });
        return t("reassign", { name, from: d.fromName, to: d.toName });
      case "task.status":
        if (d.to === "done") return t("statusDone", { name });
        return t("status", { name, from: status(d.from), to: status(d.to) });
      case "task.update": {
        const fields = Object.keys(d.after ?? {}).map((k) =>
          tFields.has(k as never) ? tFields(k as never) : k,
        );
        return t("update", { name, fields: fields.join(", ") });
      }
      case "task.check":
        return t(d.op === "add" ? "checkAdd" : d.op === "untick" ? "checkUntick" : "checkTick", {
          name,
          title: d.title ?? "",
        });
      case "task.snooze":
        return t("snooze", { name, date: d.until ? formatDateWeekdayDay(d.until, locale) : "?" });
      case "task.unsnooze":
        return t("unsnooze", { name });
      case "task.comment":
        return t("comment", { name });
      case "task.effort":
        return t("effort", { name });
      case "task.undo":
        return t("undo", { name });
      default:
        return t("other", { name, action: e.action });
    }
  }

  if (entries.length === 0) return <p className="text-muted-foreground text-small">{t("empty")}</p>;
  return (
    <ol className="flex flex-col gap-2.5">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-col text-small">
          <span>{describe(e)}</span>
          {typeof asDiff(e.diff).note === "string" && (
            <span className="whitespace-pre-wrap text-muted-foreground">
              {t("note", { note: asDiff(e.diff).note as string })}
            </span>
          )}
          <time dateTime={e.at} className="text-muted-foreground text-tiny">
            {formatInstant(new Date(e.at), locale)}
          </time>
        </li>
      ))}
    </ol>
  );
}
