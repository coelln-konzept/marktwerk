import { formatDate } from "./format";

/*
 * Pure helpers of the command palette search (Strg+K): split a query into words, fold umlauts, rank a
 * match, clean up hit titles. The SQL side (`server/search-core.ts`) builds the same rules into its queries;
 * the palette uses `scoreMatch` for the fixed actions.
 */

/** Longest query we look at (words beyond the sixth are ignored). */
const MAX_TOKENS = 6;

/** "Köln" -> "koln", "Straße" -> "strase" (same as the `translate()` of the SQL side). */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "s");
}

/** The words of a query, folded and without duplicates: "Flohmarkt  Bonn 2026" -> ["flohmarkt", "bonn", "2026"]. */
export function tokenize(query: string): string[] {
  const words = foldText(query)
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return [...new Set(words)].slice(0, MAX_TOKENS);
}

/** Escapes `% _ \` for a SQL `like` pattern. */
export function escapeLike(text: string): string {
  return text.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/** Escapes regular-expression metacharacters (Postgres `~` and JavaScript alike). */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * How well `query` matches a record, lower is better; `null` = no match.
 * 0: the title starts with the whole query · 1: every word starts a word of the title ·
 * 2: every word starts a word of title + secondary text · 3: the words only appear inside words ("bonn" in "Abonnent").
 */
export function scoreMatch(query: string, title: string, secondary = ""): number | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  const primary = foldText(title);
  const haystack = foldText(`${title} ${secondary}`);
  if (!tokens.every((token) => haystack.includes(token))) return null;
  if (primary.startsWith(tokens.join(" "))) return 0;
  const startsWord = (text: string, token: string) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(token)}`, "u").test(text);
  if (tokens.every((token) => startsWord(primary, token))) return 1;
  if (tokens.every((token) => startsWord(haystack, token))) return 2;
  return 3;
}

/** "Halteverbot – 2026-04-18" -> "Halteverbot – 18.04.2026" (ISO dates are for machines, not for hit titles). */
export function formatIsoDates(text: string, locale: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, y: string, m: string, d: string) => {
    const month = Number(m);
    const day = Number(d);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
      ? formatDate(`${y}-${m}-${d}`, locale)
      : match;
  });
}

/**
 * A phone number typed the way people type it ("0221 123", "+49 221", "0049 221") as digits in the
 * stored E.164 shape (country code without "+"), or null when the query is not phone-like or too short.
 */
export function phoneDigits(query: string): string | null {
  const typed = query.trim();
  // No dots: "25.11." is a date, not a number. A bare number needs six digits ("2026" is a year).
  if (!/^[+\d][\d\s\-/()]*$/.test(typed)) return null;
  let digits = typed.replace(/\D/g, "");
  if (!/^[+0]/.test(typed) && digits.length < 6) return null;
  if (digits.startsWith("0049")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `49${digits.slice(1)}`;
  return digits.length >= 4 ? digits : null;
}
