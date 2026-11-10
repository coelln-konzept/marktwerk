/**
 * The URL words of the Besprechung (appointment) feature, in one place: `?neu=besprechung` opens the dialog,
 * `?vorschau=besprechung:<id>` the Vorschau. Producers and parsers all use these.
 */
export const APPOINTMENT_PARAM = "besprechung";

/** The `vorschau` value that opens one Besprechung. */
export function appointmentVorschauValue(id: string): string {
  return `${APPOINTMENT_PARAM}:${id}`;
}

/** `vorschau=besprechung:<id>`: the id of a Besprechung Vorschau, or null for any other value. */
export function appointmentVorschauId(value: string | undefined): string | null {
  const prefix = `${APPOINTMENT_PARAM}:`;
  return value?.startsWith(prefix) ? value.slice(prefix.length) : null;
}
