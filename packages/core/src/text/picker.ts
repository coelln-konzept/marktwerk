import { foldForms } from "./fold";
import { matchesAllWords } from "./search";

/*
 * Filtering for the record picker (UT2-07): a searchable combobox for one Ort, contact etc. Every word of
 * the query has to occur in the label or the hint (umlaut- and case-insensitive, like the registers);
 * options whose label starts with the query come first, otherwise the caller's order is kept.
 */

export type PickerOptionText = { label: string; hint?: string | null };

/** True if the label (folded) starts with the whole query (folded). */
function labelStartsWith(label: string, query: string): boolean {
  const wanted = foldForms(query);
  const forms = foldForms(label);
  return wanted.some((w) => forms.some((f) => f.startsWith(w)));
}

/** The options matching `query`: all of them for an empty query, else prefix matches first. */
export function filterPickerOptions<T extends PickerOptionText>(
  options: readonly T[],
  query: string,
): T[] {
  const q = query.trim();
  if (q === "") return [...options];
  const prefix: T[] = [];
  const rest: T[] = [];
  for (const option of options) {
    if (!matchesAllWords([option.label, option.hint], q)) continue;
    (labelStartsWith(option.label, q) ? prefix : rest).push(option);
  }
  return [...prefix, ...rest];
}

/**
 * The query the picker filters by. While the input still shows the selected record's label (picker just
 * opened), nothing is filtered and "+ Neu" gets no text; anything typed after that is the query.
 */
export function pickerQuery(input: string, selectedLabel: string | null): string {
  const q = input.trim();
  return selectedLabel !== null && q === selectedLabel.trim() ? "" : q;
}
