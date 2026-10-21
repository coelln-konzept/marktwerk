/**
 * Uploaded documents (receipts, invoices, permits, photos). Pure checks on the bytes: the server never
 * trusts the file name or the declared type alone, it looks at the first bytes (magic numbers).
 * Files are stored as they came (no re-encoding), so a HEIC photo stays a HEIC photo.
 */

/** Largest accepted upload (a phone photo is 2–8 MB). */
export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

export type DocumentFileType = {
  mime: "application/pdf" | "image/jpeg" | "image/png" | "image/heic" | "application/xml";
  ext: "pdf" | "jpg" | "png" | "heic" | "xml";
};

/** Types shown in the file picker (`accept`). XML is only for e-invoices (ZUGFeRD/XRechnung). */
export const DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.xml";

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/** HEIF brands that Apple/Android cameras write. */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/**
 * Recognises PDF, JPEG, PNG, HEIC and XML by their first bytes; null for anything else. The result's
 * `mime` is what gets stored and served, regardless of what the browser claimed.
 */
export function sniffDocumentType(bytes: Uint8Array): DocumentFileType | null {
  if (bytes.length < 12) return null;
  if (ascii(bytes, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: "image/jpeg", ext: "jpg" };
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { mime: "image/png", ext: "png" };
  if (ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 12)))
    return { mime: "image/heic", ext: "heic" };
  // XML: optional UTF-8 BOM, optional whitespace, then "<?xml" or a root element.
  let at = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (
    at < bytes.length &&
    (bytes[at] === 0x20 || bytes[at] === 0x0a || bytes[at] === 0x0d || bytes[at] === 0x09)
  )
    at++;
  if (ascii(bytes, at, at + 5) === "<?xml") return { mime: "application/xml", ext: "xml" };
  return null;
}

/** Whether a browser can show the type inline; everything else is offered as a download. */
export function isInlineType(mime: string): boolean {
  return mime === "application/pdf" || mime === "image/jpeg" || mime === "image/png";
}

/** A file name safe for a Content-Disposition header and a zip entry: no paths, no control characters. */
export function safeFileName(name: string, fallback = "datei"): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const printable = [...base]
    .filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
    .join("");
  const cleaned = printable
    .replace(/["<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return cleaned === "" || cleaned === "." || cleaned === ".." ? fallback : cleaned;
}

const TRANSLITERATION: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};

/** "Müller & Söhne GmbH" → "Mueller-Soehne-GmbH": ASCII only, for file names in the tax advisor bundle. */
export function slugForFileName(text: string, maxLength = 40): string {
  return text
    .replace(/[äöüÄÖÜß]/g, (c) => TRANSLITERATION[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/**
 * `YYYY-MM-DD_Lieferant_Betrag_Veranstaltung.ext`: the name receipts get in the monthly bundle for the tax
 * advisor (research 07). Empty parts are left out.
 */
export function bundleFileName(input: {
  date: string;
  counterparty?: string | null;
  amountCents: number;
  event?: string | null;
  ext: string;
}): string {
  const amount = (input.amountCents / 100).toFixed(2);
  const parts = [
    input.date,
    slugForFileName(input.counterparty ?? ""),
    amount,
    slugForFileName(input.event ?? ""),
  ].filter((p) => p !== "");
  return `${parts.join("_")}.${input.ext}`;
}
