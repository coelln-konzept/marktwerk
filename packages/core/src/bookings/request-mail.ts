/**
 * Deterministic parser for the stall-request emails the website form sends (ADR 0013 fallback route,
 * ADR 0014: no AI). The form always writes the same "Key: value" layout, so fixed rules are enough.
 * Anything that doesn't match is reported field by field: a parse error means the template changed and
 * a person has to look (never guess).
 *
 * Layout (one field per line, free text may run over several lines until the next known key):
 *
 *   Betreff: Standanfrage – <Veranstaltung> – <Termin>
 *   Veranstaltung: Flohmarkt Heumarkt
 *   Termine: 04.04.2027, 02.05.2027
 *   Name: Petra Schmitz
 *   Firma: (optional)
 *   Art: privat | gewerblich
 *   E-Mail: petra@example.com
 *   Telefon: 0221 123456
 *   Standlänge: 4 m          (also "3,5 m", "350 cm")
 *   Auto am Stand: ja | nein
 *   Autolänge: 5 m           (only with Auto am Stand: ja)
 *   Strom: ja | nein
 *   Sortiment: Trödel, Bücher
 *   Stammplatz: Reihe A, ca. 40 m   (optional, a preference, never a right)
 *   Anmerkung: free text …
 *   Anfrage-ID: CK-2026-000123      (idempotency key together with the Message-ID)
 */

export type VendorKindInput = "private" | "commercial";

export interface StallRequest {
  requestRef: string;
  eventName: string;
  /** ISO dates (yyyy-mm-dd), one booking per date after the split. */
  dates: string[];
  name: string;
  companyName: string | null;
  kind: VendorKindInput;
  email: string;
  phone: string | null;
  lengthCm: number;
  carRequested: boolean;
  carLengthCm: number | null;
  power: boolean;
  categories: string[];
  preferredSpot: SpotPreference | null;
  note: string | null;
}

export interface SpotPreference {
  /** Row label as printed on the plan ("A"). */
  rowLabel: string;
  /** Approximate start along the row, if given ("ca. 40 m"). */
  offsetCm: number | null;
  raw: string;
}

export type ParseIssue = { field: string; code: "missing" | "invalid"; value?: string };

export type ParseResult =
  | { kind: "not_a_request" }
  | { kind: "request"; ok: true; request: StallRequest; warnings: ParseIssue[] }
  | {
      kind: "request";
      ok: false;
      partial: Partial<StallRequest>;
      errors: ParseIssue[];
      warnings: ParseIssue[];
    };

const SUBJECT_PREFIX = /^\s*(?:(?:AW|WG|Re|Fwd?):\s*)*Standanfrage\b/i;

/** Known keys → canonical field. Matching is case-insensitive and ignores a trailing colon. */
const KEYS: Record<string, keyof RawFields> = {
  veranstaltung: "event",
  markt: "event",
  termine: "dates",
  termin: "dates",
  name: "name",
  firma: "company",
  art: "kind",
  "e-mail": "email",
  email: "email",
  telefon: "phone",
  standlänge: "length",
  standlaenge: "length",
  "auto am stand": "car",
  autolänge: "carLength",
  autolaenge: "carLength",
  strom: "power",
  sortiment: "categories",
  stammplatz: "spot",
  "wunsch / anmerkung": "note",
  anmerkung: "note",
  "anfrage-id": "ref",
};

interface RawFields {
  event?: string;
  dates?: string;
  name?: string;
  company?: string;
  kind?: string;
  email?: string;
  phone?: string;
  length?: string;
  car?: string;
  carLength?: string;
  power?: string;
  categories?: string;
  spot?: string;
  note?: string;
  ref?: string;
}

/** True when the subject marks a form-generated stall request. */
export function isStallRequestSubject(subject: string): boolean {
  return SUBJECT_PREFIX.test(subject);
}

/** Splits the body into known fields; continuation lines belong to the last key (free text). */
export function readFields(body: string): RawFields {
  const out: RawFields = {};
  let current: keyof RawFields | null = null;
  for (const rawLine of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (/^-{3,}\s*$/.test(line.trim())) {
      current = null;
      continue;
    }
    const m = /^\s*([^:]{2,30}):\s?(.*)$/.exec(line);
    const key = m?.[1] ? KEYS[m[1].trim().toLowerCase()] : undefined;
    if (m && key) {
      current = key;
      out[key] = (m[2] ?? "").trim();
      continue;
    }
    // Free text continues only for the note; any other unknown line ends the field.
    if (current === "note" && line.trim() !== "") {
      out.note = `${out.note ? `${out.note}\n` : ""}${line.trim()}`;
    } else if (line.trim() !== "") {
      current = null;
    }
  }
  return out;
}

/** "4 m", "3,5 m", "3.5m", "350 cm", "4" (metres) → centimetres; null when unreadable. */
export function parseLengthCm(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(m|cm|meter|metern?)?\s*$/i.exec(value);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? "m").toLowerCase();
  return Math.round(unit === "cm" ? n : n * 100);
}

/** "dd.mm.yyyy" (also d.m.yyyy) → ISO; null for impossible dates. */
export function parseGermanDate(value: string): string | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(value);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseYesNo(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (["ja", "yes", "x", "1"].includes(v)) return true;
  if (["nein", "no", "", "-", "0"].includes(v)) return false;
  return null;
}

/** "Reihe A, ca. 40 m" / "A 12m" / "Reihe B" → preference; null when it names no row. */
export function parseSpotPreference(value: string | undefined): SpotPreference | null {
  if (!value?.trim()) return null;
  const row = /(?:reihe\s*)?\b([A-Z]{1,2})\b/i.exec(value);
  if (!row) return null;
  const off = /(\d+(?:[.,]\d+)?)\s*m\b/i.exec(value);
  return {
    rowLabel: (row[1] ?? "").toUpperCase(),
    offsetCm: off?.[1] ? Math.round(Number(off[1].replace(",", ".")) * 100) : null,
    raw: value.trim(),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parses one email. Non-request mails return `not_a_request`; requests always list every problem. */
export function parseStallRequestMail(mail: { subject: string; body: string }): ParseResult {
  const f = readFields(mail.body);
  if (!isStallRequestSubject(mail.subject) && !f.ref) return { kind: "not_a_request" };

  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const need = (field: keyof RawFields, label: string) => {
    const v = f[field]?.trim();
    if (!v) errors.push({ field: label, code: "missing" });
    return v ?? "";
  };

  const requestRef = need("ref", "requestRef");
  const eventName = need("event", "eventName");
  const name = need("name", "name");
  const email = need("email", "email");
  if (email && !EMAIL.test(email)) errors.push({ field: "email", code: "invalid", value: email });

  const dates: string[] = [];
  const rawDates = need("dates", "dates");
  for (const part of rawDates
    .split(/[,;]|\s+und\s+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const iso = parseGermanDate(part);
    if (iso) dates.push(iso);
    else errors.push({ field: "dates", code: "invalid", value: part });
  }

  const lengthCm = parseLengthCm(f.length);
  if (f.length === undefined || f.length === "")
    errors.push({ field: "lengthCm", code: "missing" });
  else if (lengthCm === null) errors.push({ field: "lengthCm", code: "invalid", value: f.length });

  const kindRaw = f.kind?.trim().toLowerCase() ?? "";
  let kind: VendorKindInput = "private";
  if (kindRaw.startsWith("gewerb") || kindRaw === "commercial") kind = "commercial";
  else if (kindRaw && !kindRaw.startsWith("priv"))
    warnings.push({ field: "kind", code: "invalid", value: f.kind });

  const car = parseYesNo(f.car);
  if (car === null) warnings.push({ field: "carRequested", code: "invalid", value: f.car });
  const carRequested = car ?? false;
  let carLengthCm = carRequested ? parseLengthCm(f.carLength) : null;
  if (carRequested && carLengthCm === null) {
    warnings.push({
      field: "carLengthCm",
      code: f.carLength ? "invalid" : "missing",
      value: f.carLength,
    });
    carLengthCm = 500; // a normal car; the person checks it
  }
  const power = parseYesNo(f.power) ?? false;

  const spot = parseSpotPreference(f.spot);
  if (f.spot?.trim() && !spot)
    warnings.push({ field: "preferredSpot", code: "invalid", value: f.spot });

  const request: Partial<StallRequest> = {
    requestRef,
    eventName,
    dates,
    name,
    companyName: f.company?.trim() || null,
    kind,
    email,
    phone: f.phone?.trim() || null,
    lengthCm: lengthCm ?? undefined,
    carRequested,
    carLengthCm,
    power,
    categories: (f.categories ?? "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
    preferredSpot: spot,
    note: f.note?.trim() || null,
  };

  if (errors.length > 0) return { kind: "request", ok: false, partial: request, errors, warnings };
  return { kind: "request", ok: true, request: request as StallRequest, warnings };
}
