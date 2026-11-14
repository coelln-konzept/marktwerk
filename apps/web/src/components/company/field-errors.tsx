"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** Error text per field id; `form` holds a message that belongs to no single field. */
export type FieldErrors = Record<string, string>;

/**
 * Errors of the Firma forms, shown at the field (UX-067: only the first error showed, at the bottom of the page).
 * `idOf` turns a field key into its element id; the error paragraph gets `<id>-error`.
 */
export function useFieldErrors(idOf: (field: string) => string) {
  const [errors, setErrors] = useState<FieldErrors>({});

  /** Shows all errors at once and puts the focus on the first field that has one (in `order`). */
  function show(next: FieldErrors, order: readonly string[]) {
    setErrors(next);
    const first = order.find((field) => next[field]);
    if (first) document.getElementById(idOf(first))?.focus();
  }

  /** aria props for a field: invalid and described by its error while it has one. */
  function invalid(field: string, describedBy?: string) {
    const text = errors[field];
    const ids = [describedBy, text ? `${idOf(field)}-error` : null].filter(Boolean).join(" ");
    return {
      "aria-invalid": text ? (true as const) : undefined,
      "aria-describedby": ids || undefined,
    };
  }

  return { errors, show, clear: () => setErrors({}), invalid };
}

/** The error under a field (nothing while it has none). */
export function FieldError({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null;
  return (
    <p id={`${id}-error`} className="text-small text-status-critical">
      {text}
    </p>
  );
}

/**
 * The footer line of a form: the error that belongs to no field, or how many fields need a look (the
 * errors themselves sit at the fields).
 */
export function FormErrorSummary({ errors }: { errors: FieldErrors }) {
  const t = useTranslations("company.errors");
  const fieldCount = Object.keys(errors).filter((key) => key !== "form").length;
  return (
    <p role="alert" className="min-w-0 flex-1 text-small text-status-critical">
      {errors.form ?? (fieldCount > 0 ? t("fieldsToCheck", { count: fieldCount }) : null)}
    </p>
  );
}
