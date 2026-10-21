/*
 * @mentions in task comments. A mention is "@" followed by a staff member's display name
 * ("@Anna Meier"); the comment form inserts the full name. Matching is case-insensitive, prefers the
 * longest name ("@Anna Maria Lang" is not also "@Anna Maria") and needs a word boundary after the
 * name ("@Anna Meiers" does not mention Anna Meier).
 */

export type Mentionable = { id: string; displayName: string };

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function findMentions(body: string, people: Mentionable[]): string[] {
  const names = [...people]
    .filter((p) => p.displayName.trim() !== "")
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const lower = body.toLowerCase();
  const taken: [number, number][] = [];
  const found = new Set<string>();

  for (const person of names) {
    const needle = `@${person.displayName.trim().toLowerCase()}`;
    let from = 0;
    while (from <= lower.length - needle.length) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      from = at + 1;
      const next = lower[end];
      const boundary = next === undefined || !LETTER_OR_DIGIT.test(next);
      const before = lower[at - 1];
      const startsWord = before === undefined || !LETTER_OR_DIGIT.test(before);
      const overlaps = taken.some(([s, e]) => at < e && end > s);
      if (boundary && startsWord && !overlaps) {
        taken.push([at, end]);
        found.add(person.id);
      }
    }
  }
  return [...found];
}
