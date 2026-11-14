"use client";

import { CalendarDays, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { checkDateInput, type DateInputError } from "@/lib/date-input";
import { formatDateWithWeekday, formatWeek, todayIn } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "./input";

/**
 * The one date field (UX-001, UX concept §8, F2 class B): typed German dates first, the calendar second.
 *
 * - Takes "5.3.", "5.3", "05.03.26", "5.3.2027", "0503", "heute", "morgen", "übermorgen", "gestern" and ISO.
 *   Without a year: this year, or next year when `min` rules this year out.
 * - Shows what it understood: "Do 05.03.2026" in the field once you leave it, the KW inside the field,
 *   and while typing a line under the field.
 * - Half-typed or impossible text is an error at the field ("Bitte das Datum vollständig angeben"), never a
 *   silently empty value: `onValueChange` is not called, the field is `:invalid` (custom validity, so a
 *   normal form will not submit and `form.checkValidity()` is false even with `noValidate`), and the
 *   hidden `name` input carries the raw text, so a server check rejects it instead of saving "no date".
 * - Esc while the text differs from the last value puts that value back (and is not passed on to a drawer).
 *
 * Two ways to use it:
 * - In a form: `<DateField name="dueOn" defaultValue={task.dueOn} />` posts "YYYY-MM-DD" (or "").
 * - Controlled: `<DateField value={due} onValueChange={save} />`; `onValueChange` runs when the field is
 *   left, on Enter and on a pick in the calendar, with "YYYY-MM-DD" or null (cleared), only when it changed.
 *
 * Label it like `Input`: `<Label htmlFor={id}>` + `id`, or `aria-label`. Width: `className` (default 14rem).
 */
export function DateField({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  required = false,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: {
  id?: string;
  /** Posts the date as "YYYY-MM-DD" ("" when empty) under this name. */
  name?: string;
  /** Controlled value ("YYYY-MM-DD" or null). A new value from outside replaces the text. */
  value?: string | null;
  /** Initial value when uncontrolled. */
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  /** Earliest / latest allowed date ("YYYY-MM-DD"). */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const t = useTranslations("dateField");
  const locale = useLocale();
  const ownId = useId();
  const inputId = id ?? ownId;
  const messageId = `${inputId}-message`;
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const show = (date: string | null | undefined) =>
    date ? formatDateWithWeekday(date, locale) : "";
  const initial = value !== undefined ? value : (defaultValue ?? null);
  const [text, setText] = useState(() => show(initial));
  const [focused, setFocused] = useState(false);
  // Errors show once the field was left or a submit asked (not while still typing).
  const [touched, setTouched] = useState(false);
  /** The last value handed out (or received): what Esc returns to and what "changed" compares with. */
  const committed = useRef<string | null>(initial);

  // A new value from outside (saved, reverted, another record) replaces the text.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside change of `value` resets
  useEffect(() => {
    if (value === undefined || value === committed.current) return;
    committed.current = value;
    setText(show(value));
    setTouched(false);
  }, [value]);

  const today = todayIn();
  const check = checkDateInput(text, { today, min, max, required });
  const errorText = check.error ? errorMessage(check.error) : null;

  function errorMessage(error: DateInputError): string {
    if (error === "tooEarly") return t("errors.tooEarly", { date: show(min) });
    if (error === "tooLate") return t("errors.tooLate", { date: show(max) });
    return t(`errors.${error}`);
  }

  useEffect(() => {
    inputRef.current?.setCustomValidity(errorText ?? "");
  }, [errorText]);

  /** Hands a valid value out (when it changed) and writes it back in the field's own format. */
  function commit(next = check) {
    if (next.error) {
      setTouched(true);
      return;
    }
    setText(show(next.value));
    setTouched(false);
    if (next.value === committed.current) return;
    committed.current = next.value;
    onValueChange?.(next.value);
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker) return;
    picker.value = check.value ?? committed.current ?? "";
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  }

  const echo = check.value && focused && text !== show(check.value) ? show(check.value) : null;
  const message =
    errorText && touched ? (
      <span className="flex items-start gap-1.5 text-status-critical">
        <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {errorText}
      </span>
    ) : echo ? (
      <span className="text-foreground-2">{echo}</span>
    ) : focused && text === "" ? (
      <span className="text-muted-foreground">{t("hint")}</span>
    ) : null;

  return (
    <div className={cn("flex w-56 max-w-full flex-col gap-1", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("placeholder")}
          aria-label={ariaLabel}
          aria-invalid={errorText && touched ? true : undefined}
          aria-describedby={describedBy ? `${describedBy} ${messageId}` : messageId}
          // Unsaved typing: Esc belongs to the field (see `escapeClosesOverlay` in drawer.tsx).
          data-editing={text !== show(committed.current) ? "true" : undefined}
          required={required}
          disabled={disabled}
          value={text}
          className="pr-20 tabular"
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onInvalid={() => setTouched(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            else if (event.key === "Escape" && text !== show(committed.current)) {
              // First Esc undoes the typing; the next one belongs to the drawer or dialog.
              event.preventDefault();
              event.stopPropagation();
              setText(show(committed.current));
              setTouched(false);
            }
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-9 flex items-center text-muted-foreground text-tiny tabular tap:right-11">
          {check.value ? formatWeek(check.value, locale) : null}
        </span>
        <button
          type="button"
          disabled={disabled}
          aria-label={t("pick")}
          title={t("pick")}
          onClick={openPicker}
          className="absolute inset-y-0 right-0 grid w-9 cursor-pointer place-items-center rounded-r-lg text-muted-foreground hover:text-foreground disabled:cursor-not-allowed tap:w-11"
        >
          <CalendarDays aria-hidden className="size-4" />
        </button>
        {/* The browser's own calendar, opened by the button; never focused or read on its own. `form=""`
            gives it no form owner, so its own min/max never block a submit (only the text field's check does). */}
        <input
          ref={pickerRef}
          form=""
          type="date"
          tabIndex={-1}
          aria-hidden
          min={min}
          max={max}
          className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
          onChange={(event) => {
            const picked = event.target.value;
            if (!picked) return;
            const next = checkDateInput(picked, { today, min, max, required });
            commit(next);
            inputRef.current?.focus();
          }}
        />
      </div>
      {name && (
        <input
          type="hidden"
          name={name}
          value={check.error && check.error !== "required" ? text : (check.value ?? "")}
        />
      )}
      <p id={messageId} aria-live="polite" className="min-h-0 text-tiny empty:hidden">
        {message}
      </p>
    </div>
  );
}
