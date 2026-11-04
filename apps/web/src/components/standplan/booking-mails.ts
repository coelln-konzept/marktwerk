import { quoteStall, stallNumber } from "@marktwerk/core";
import type { BookingSettings, Reservation, StoredPlacement } from "./store";
import type { BookingItem, PlanEvent, PlanRow } from "./types";

/**
 * Vendor-facing mails of the two-step booking (German, "Sie", per the decision log). Plain text like
 * every outbound message in the prototype; the real build sends via the shared mailbox (ADR 0008) and
 * adds the Platzkarte PDF (M10). Modelled on the company's current Platzkarte mail; venue-specific rules
 * (car stall ranges, unloading by stall range) need venue data and stay generic for now.
 */

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const de = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const deLong = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${de(iso)}`;
const euro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const metres = (cm: number) => `${new Intl.NumberFormat("de-DE").format(cm / 100)} m`;

const FOOTER = [
  "Cölln Konzept · Veranstaltungsagentur",
  "coelln-konzept.de · info@coelln-konzept.de",
];

const bankLines = (s: BookingSettings) => [
  `Empfänger: ${s.payee}`,
  `Bank: ${s.bank}`,
  `IBAN: ${s.iban}`,
  s.bic ? `BIC: ${s.bic}` : null,
];

export function stallAmount(ev: PlanEvent, p: Pick<StoredPlacement, "startCm" | "endCm">) {
  return quoteStall({
    lengthCm: p.endCm - p.startCm,
    pricePerMCents: ev.pricePerMCents,
    bookingFeeCents: ev.bookingFeeCents,
  });
}

const join = (lines: (string | null)[]) => lines.filter((l) => l !== null).join("\n");

/** The Platzkarte: reserves the stall and asks for the transfer with one reference code. */
export function platzkarteMail(input: {
  item: BookingItem;
  ev: PlanEvent;
  row: PlanRow;
  p: StoredPlacement;
  reservation: Pick<Reservation, "dueOn" | "reference" | "amountCents">;
  settings: BookingSettings;
}) {
  const { item, ev, row, p, reservation, settings } = input;
  const quote = stallAmount(ev, p);
  const nr = stallNumber(row.label, p.startCm);
  const extras = [p.car ? "Auto am Stand" : null, item.power ? "Strom" : null].filter(Boolean);
  const subject = `Platzkarte – ${ev.name} am ${de(ev.startsOn)} – Platz ${nr}`;
  const body = join([
    `Guten Tag ${item.vendorName},`,
    "",
    `vielen Dank für Ihre Anfrage (${item.requestRef}). Wir haben folgenden Platz für Sie reserviert:`,
    "",
    `PLATZKARTE – ${ev.name}`,
    "",
    `Veranstaltung: ${ev.name}`,
    `Termin: ${deLong(ev.startsOn)}`,
    `Laufende Meter: ${metres(p.endCm - p.startCm)}`,
    `Extras: ${extras.length ? extras.join(", ") : "keine"}`,
    `Platznummer: ${nr} (Reihe ${row.label})`,
    `Betrag: ${euro(quote.totalCents)} (${metres(quote.billedCm)} × ${euro(ev.pricePerMCents)}${quote.feeCents ? ` + ${euro(quote.feeCents)} Buchungsgebühr` : ""})`,
    "",
    `Bitte überweisen Sie ${euro(reservation.amountCents)} bis spätestens ${deLong(reservation.dueOn)} auf folgendes Konto:`,
    "",
    ...bankLines(settings),
    "",
    `Verwendungszweck: ${reservation.reference}`,
    "(Bitte nur diesen Code angeben, so können wir Ihre Zahlung sicher zuordnen.)",
    "",
    `Ist der Betrag bis ${de(reservation.dueOn)} nicht auf unserem Konto eingegangen, wird die Reservierung automatisch gelöscht und der Platzanspruch verfällt. Vorher erhalten Sie eine Erinnerung.`,
    "",
    "Zu beachten:",
    "– Einen Platzanspruch haben Sie erst, wenn Ihre Platzkarte bezahlt ist.",
    "– Nach Eingang Ihrer Überweisung erfolgt keine weitere Bestätigung mehr.",
    "– Bitte bringen Sie diese Platzkarte mit zur Veranstaltung.",
    p.car
      ? "– Ein Autoparkplatz am Stand steht nur zur Verfügung, wenn die gebuchte Platzlänge der tatsächlichen Fahrzeuglänge entspricht."
      : null,
    "– Bei Stornierungen bis 7 Tage vor der Veranstaltung fallen Verwaltungskosten in Höhe von 5,00 € an, bei späteren Stornierungen die gesamte Standmiete.",
    "",
    "Info zum Markt:",
    ev.times.setup ? `Aufbau: ab ${ev.times.setup} Uhr` : null,
    ev.times.open && ev.times.close ? `Marktzeit: ${ev.times.open}–${ev.times.close} Uhr` : null,
    `Wo: ${ev.venueName}`,
    "",
    // The market rules only apply to flea and antique markets (event type data comes later).
    ...(/floh|antik|trödel/i.test(ev.name)
      ? [
          "Auszug aus der Flohmarktverordnung:",
          "– Der Verkauf von Neuware ist verboten.",
          "– Der Verkauf oder das Zurschaustellen von Nazi- und SS-Emblemen sowie deren literarischer Darstellung ist gesetzlich verboten.",
          "– Jeder hat seinen Platz und das Umfeld sauber zu verlassen.",
          "– Bei kommerziellem Verkauf ist ein Namensschild am Stand anzubringen.",
          "",
        ]
      : []),
    "Mit freundlichen Grüßen",
    "Ihr Team von Cölln Konzept",
    "",
    ...FOOTER,
  ]);
  return { subject, body, stallNumber: nr, totalCents: quote.totalCents };
}

/** Payment reminder, sent automatically on the reminder day (setting). */
export function reminderMail(r: Reservation, settings: BookingSettings) {
  const subject = `Zahlungserinnerung – ${r.eventName} am ${de(r.eventDate)} – Platz ${r.stallNumber}`;
  const body = join([
    `Guten Tag ${r.vendorName},`,
    "",
    `für Ihren reservierten Platz ${r.stallNumber} beim ${r.eventName} am ${deLong(r.eventDate)} ist bei uns noch keine Zahlung eingegangen.`,
    "",
    `Bitte überweisen Sie ${euro(r.amountCents)} bis spätestens ${deLong(r.dueOn)}:`,
    "",
    ...bankLines(settings),
    `Verwendungszweck: ${r.reference}`,
    "",
    `Geht die Zahlung bis dahin nicht ein, wird Ihre Reservierung automatisch freigegeben. Haben Sie bereits überwiesen, ist diese Mail gegenstandslos.`,
    "",
    "Mit freundlichen Grüßen",
    "Ihr Team von Cölln Konzept",
    "",
    ...FOOTER,
  ]);
  return { subject, body };
}

/** Sent when an unpaid reservation is released after the due date. */
export function releaseMail(r: Reservation) {
  const subject = `Reservierung storniert – ${r.eventName} am ${de(r.eventDate)} – Platz ${r.stallNumber}`;
  const body = join([
    `Guten Tag ${r.vendorName},`,
    "",
    `leider ist für Ihren reservierten Platz ${r.stallNumber} beim ${r.eventName} am ${deLong(r.eventDate)} bis zum ${de(r.dueOn)} keine Zahlung eingegangen. Die Reservierung ist daher storniert und der Platz wieder frei.`,
    "",
    "Möchten Sie trotzdem teilnehmen, senden Sie uns gern eine neue Anfrage über unsere Website.",
    "",
    "Mit freundlichen Grüßen",
    "Ihr Team von Cölln Konzept",
    "",
    ...FOOTER,
  ]);
  return { subject, body };
}
