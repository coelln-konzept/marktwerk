import { quoteStall, stallNumber } from "@marktwerk/core";
import type { StoredPlacement } from "./store";
import type { BookingItem, PlanEvent, PlanRow } from "./types";

const de = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const euro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const metres = (cm: number) => `${new Intl.NumberFormat("de-DE").format(cm / 100)} m`;

/**
 * The vendor-facing confirmation (German only: vendors get German mail, addressed with "Sie" per the decision log). Plain text like every
 * outbound_message today; the real build adds the Platzkarte PDF (roadmap M10) and sends via the
 * shared mailbox (ADR 0008).
 */
export function confirmationMail(
  item: BookingItem,
  ev: PlanEvent,
  row: PlanRow,
  p: StoredPlacement,
) {
  const quote = quoteStall({
    lengthCm: p.endCm - p.startCm,
    pricePerMCents: ev.pricePerMCents,
    bookingFeeCents: ev.bookingFeeCents,
  });
  const nr = stallNumber(row.label, p.startCm);
  const subject = `Standbestätigung ${ev.name} am ${de(ev.startsOn)} – Stand ${nr}`;
  const body = [
    `Guten Tag ${item.vendorName},`,
    "",
    `vielen Dank für Ihre Anfrage (${item.requestRef}). Wir bestätigen Ihren Stand:`,
    "",
    `Veranstaltung: ${ev.name}`,
    `Datum: ${de(ev.startsOn)}`,
    `Ort: ${ev.venueName}`,
    `Stand: ${nr} (Reihe ${row.label}, Meter ${metres(p.startCm)} bis ${metres(p.endCm)})`,
    `Standlänge: ${metres(p.endCm - p.startCm)}${p.car ? ", mit Auto am Stand" : ""}`,
    ev.times.setup ? `Aufbau ab: ${ev.times.setup} Uhr` : null,
    ev.times.open && ev.times.close ? `Marktzeit: ${ev.times.open}–${ev.times.close} Uhr` : null,
    "",
    `Standgebühr: ${metres(quote.billedCm)} × ${euro(ev.pricePerMCents)} = ${euro(quote.frontageCents)}`,
    `Buchungsgebühr: ${euro(quote.feeCents)}`,
    `Gesamt: ${euro(quote.totalCents)}`,
    "",
    "Bitte bringen Sie diese Bestätigung am Markttag mit. Der Platz wird vor Ort markiert; kleine Verschiebungen durch die Platzanweiser sind möglich.",
    "",
    "Mit freundlichen Grüßen",
    "Ihr Team von Coelln Konzept",
  ]
    .filter((l) => l !== null)
    .join("\n");
  return { subject, body, stallNumber: nr, totalCents: quote.totalCents };
}
