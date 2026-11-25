import type { useTranslations } from "next-intl";

type DocumentsT = ReturnType<typeof useTranslations<"documents">>;

/**
 * The sentence for a `DocumentError` code (`documents.errors.<code>`); a duplicate names the file that already
 * hangs on the record. Unknown codes get `fallback` (the key of a `documents` message).
 */
export function documentErrorText(
  t: DocumentsT,
  code: string,
  existing?: string,
  fallback = "errors.generic",
): string {
  if (code === "duplicate" && existing) return t("errors.duplicateOf", { name: existing });
  const key = `errors.${code}`;
  return t.has(key as never) ? t(key as never) : t(fallback as never);
}
