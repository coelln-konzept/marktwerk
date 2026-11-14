import { isMonthDay } from "@marktwerk/core";

/**
 * "30.11." or "30.11" or "1.4." → "11-30" / "04-01"; "" → null; anything else, also a day the month
 * does not have (31.02., 31.04.), → undefined (invalid). 29.02. is valid (leap years).
 */
export function parseDayMonth(input: string): string | null | undefined {
  const text = input.trim();
  if (text === "") return null;
  const match = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(text);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isMonthDay(md) ? md : undefined;
}

/** "11-30" → "30.11." for an input field. */
export function dayMonthInput(md: string | null): string {
  if (!md) return "";
  const [month, day] = md.split("-");
  return `${day}.${month}.`;
}
