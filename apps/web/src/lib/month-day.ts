/** "30.11." or "30.11" or "1.4." → "11-30" / "04-01"; "" → null; anything else → undefined (invalid). */
export function parseDayMonth(input: string): string | null | undefined {
  const text = input.trim();
  if (text === "") return null;
  const match = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(text);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "11-30" → "30.11." for an input field. */
export function dayMonthInput(md: string | null): string {
  if (!md) return "";
  const [month, day] = md.split("-");
  return `${day}.${month}.`;
}
