/**
 * CSV for the tax advisor: semicolon-separated (German Excel), CRLF lines, UTF-8 with BOM, amounts with a
 * decimal comma. Text cells that a spreadsheet could read as a formula get a leading apostrophe.
 */

const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: quoted when it holds the delimiter, a quote or a line break; formula-looking text is defused. */
export function csvCell(value: string | number | null | undefined, delimiter = ";"): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /["\r\n]/.test(text) || text.includes(delimiter)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

/** The whole file: BOM, header, rows. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
  delimiter = ";",
): string {
  const lines = [header, ...rows].map((row) =>
    row.map((c) => csvCell(c, delimiter)).join(delimiter),
  );
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

/** 123456 → "1234,56": amounts in a CSV for German Excel (no thousands separator). */
export function csvAmount(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
