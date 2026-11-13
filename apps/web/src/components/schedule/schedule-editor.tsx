"use client";

import {
  MAX_SCHEDULE_ROWS,
  normalizeClockTime,
  SCHEDULE_AUDIENCES,
  SCHEDULE_DAYS,
  SCHEDULE_KINDS,
  type ScheduleIssue,
  type ScheduleIssueCode,
  type ScheduleRow,
  validateSchedule,
} from "@marktwerk/core";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

/** A row as edited: times as typed, plus a stable key for the list. */
export type ScheduleDraftRow = ScheduleRow & { key: string };

/** Keys of added rows (client only); loaded rows use their index, so server and client render alike. */
let nextKey = 0;
const newKey = () => {
  nextKey += 1;
  return `neu${nextKey}`;
};

/** Stored rows → rows to edit. */
export function toScheduleDraft(rows: readonly ScheduleRow[]): ScheduleDraftRow[] {
  return rows.map((row, i) => ({ ...row, key: `z${i}` }));
}

/** Edited rows → a Zeitplan with times normalised where possible ("6" → "06:00"). */
export function fromScheduleDraft(rows: readonly ScheduleDraftRow[]): ScheduleRow[] {
  return rows.map(({ audience, kind, day, from, to }) => ({
    audience,
    kind,
    day,
    from: normalizeClockTime(from) ?? from,
    to: normalizeClockTime(to) ?? to,
  }));
}

/** The issues of the edited rows (core validateSchedule); an invalid length is checked as one day. */
export function scheduleDraftIssues(
  rows: readonly ScheduleDraftRow[],
  durationDays: number,
): ScheduleIssue[] {
  const days = Number.isInteger(durationDays) && durationDays >= 1 ? durationDays : 1;
  return validateSchedule(fromScheduleDraft(rows), days);
}

type Field = "audience" | "kind" | "day" | "from" | "to";

/** Which inputs of a row an issue marks as invalid. */
const FIELDS_OF: Record<ScheduleIssueCode, Field[]> = {
  invalid_row: ["audience", "kind", "day"],
  invalid_time: ["from", "to"],
  from_not_before_to: ["from", "to"],
  before_not_setup: ["kind", "day"],
  teardown_before_open: ["from"],
  duplicate_row: ["audience", "kind", "day", "from", "to"],
  no_visitor_hours: [],
};

/**
 * Zeitplan editor (ADR 0022): one row per window (Wer · Was · Tag · von–bis), add and remove rows. Plain
 * selects, inputs and buttons, so it works with the keyboard; adding a row focuses it, removing one moves
 * the focus to the next row (or "Zeile hinzufügen"). With `showErrors` (after a first save attempt) each
 * row shows its validateSchedule issue right below it, live while it is fixed.
 */
export function ScheduleEditor({
  value,
  onChange,
  durationDays,
  showErrors,
  idPrefix,
}: {
  value: ScheduleDraftRow[];
  onChange: (next: ScheduleDraftRow[]) => void;
  /** The event's or market's length in days (the day rules depend on it). */
  durationDays: number;
  showErrors: boolean;
  idPrefix: string;
}) {
  const t = useTranslations("schedule");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const issues = showErrors ? scheduleDraftIssues(value, durationDays) : [];
  const rowIssue = (index: number) => issues.find((issue) => issue.row === index)?.code;
  const listIssue = issues.find((issue) => issue.row === null)?.code;
  const full = value.length >= MAX_SCHEDULE_ROWS;

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const id = (key: string, field: Field | "remove" | "error") => `${idPrefix}-${key}-${field}`;
  const addId = `${idPrefix}-add`;

  function update(index: number, patch: Partial<ScheduleRow>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function add() {
    if (full) return;
    const row: ScheduleDraftRow = {
      key: newKey(),
      audience: "team",
      kind: "setup",
      day: "first",
      from: "",
      to: "",
    };
    onChange([...value, row]);
    setFocusKey(id(row.key, "audience"));
  }

  function remove(index: number) {
    const next = value[index + 1] ?? value[index - 1];
    onChange(value.filter((_, i) => i !== index));
    setFocusKey(next ? id(next.key, "remove") : addId);
  }

  const headers: { field: Field; label: string }[] = [
    { field: "audience", label: t("editor.audience") },
    { field: "kind", label: t("editor.kind") },
    { field: "day", label: t("editor.day") },
    { field: "from", label: t("editor.from") },
    { field: "to", label: t("editor.to") },
  ];
  const label = (field: Field, n: number) =>
    t("editor.fieldAria", {
      field: headers.find((h) => h.field === field)?.label ?? field,
      n: String(n),
    });
  // Narrow (dialogs): Wer · Was · Tag, then von · bis · remove; from 36rem of width all in one line.
  const grid =
    "grid grid-cols-3 items-center gap-2 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem_5.5rem_2rem]";

  return (
    <div className="@container flex flex-col gap-2">
      <p className="m-0 text-faint-foreground text-small">{t("editor.hint")}</p>
      {value.length > 0 && (
        <div aria-hidden className={cn(grid, "hidden text-muted-foreground text-tiny @xl:grid")}>
          {headers.map((h) => (
            <span key={h.field}>{h.label}</span>
          ))}
        </div>
      )}
      {value.length === 0 ? (
        <p className="m-0 text-muted-foreground text-small">{t("editor.empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {value.map((row, index) => {
            const n = index + 1;
            const code = rowIssue(index);
            const bad = (field: Field) =>
              code && FIELDS_OF[code].includes(field)
                ? { "aria-invalid": true as const, "aria-describedby": id(row.key, "error") }
                : {};
            const time = (field: "from" | "to") => (
              <Input
                id={id(row.key, field)}
                aria-label={label(field, n)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="HH:MM"
                maxLength={9}
                value={row[field]}
                onChange={(e) => update(index, { [field]: e.target.value })}
                onBlur={(e) => {
                  const normalized = normalizeClockTime(e.target.value);
                  if (normalized && normalized !== row[field])
                    update(index, { [field]: normalized });
                }}
                className="tabular"
                {...bad(field)}
              />
            );
            return (
              <li key={row.key} className="flex flex-col gap-1">
                <div className={grid}>
                  <NativeSelect
                    id={id(row.key, "audience")}
                    aria-label={label("audience", n)}
                    value={row.audience}
                    onChange={(e) =>
                      update(index, { audience: e.target.value as ScheduleRow["audience"] })
                    }
                    wrapperClassName="w-full"
                    {...bad("audience")}
                  >
                    {SCHEDULE_AUDIENCES.map((audience) => (
                      <option key={audience} value={audience}>
                        {t(`audience.${audience}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    id={id(row.key, "kind")}
                    aria-label={label("kind", n)}
                    value={row.kind}
                    onChange={(e) => update(index, { kind: e.target.value as ScheduleRow["kind"] })}
                    wrapperClassName="w-full"
                    {...bad("kind")}
                  >
                    {SCHEDULE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`kind.${kind}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    id={id(row.key, "day")}
                    aria-label={label("day", n)}
                    value={row.day}
                    onChange={(e) => update(index, { day: e.target.value as ScheduleRow["day"] })}
                    wrapperClassName="w-full"
                    {...bad("day")}
                  >
                    {SCHEDULE_DAYS.map((day) => (
                      <option key={day} value={day}>
                        {t(`day.${day}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  {time("from")}
                  {time("to")}
                  <Button
                    id={id(row.key, "remove")}
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="justify-self-start"
                    aria-label={t("editor.remove", { n: String(n) })}
                    title={t("editor.remove", { n: String(n) })}
                    onClick={() => remove(index)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                {code && (
                  <p id={id(row.key, "error")} className="m-0 text-small text-status-critical">
                    {t(`editor.errors.${code}`)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {listIssue && (
        <p className="m-0 text-small text-status-critical">{t(`editor.errors.${listIssue}`)}</p>
      )}
      <div>
        <Button id={addId} type="button" size="sm" variant="ghost" disabled={full} onClick={add}>
          <Plus aria-hidden />
          {t("editor.add")}
        </Button>
        {full && (
          <span className="ml-2 text-muted-foreground text-small">
            {t("editor.errors.too_many", { max: String(MAX_SCHEDULE_ROWS) })}
          </span>
        )}
      </div>
    </div>
  );
}
