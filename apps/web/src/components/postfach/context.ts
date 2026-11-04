import { stallNumber } from "@marktwerk/core";
import type { StandplanState } from "@/components/standplan/store";
import type { BookingItem, PlanEvent, StandplanData } from "@/components/standplan/types";
import type { Conversation, MailboxId, MailDemo, Person } from "./types";

/** Variables offered in the editor, grouped like the picker. Keys are the German names users see. */
export const VARIABLE_GROUPS = {
  absender: ["Anrede", "Vorname", "Nachname", "Firma"],
  veranstaltung: ["Veranstaltung", "Datum", "Ort", "Aufbau", "Marktzeit", "PreisProMeter"],
  stand: ["Stand", "Standlänge"],
  wir: ["MeinName", "Postfach"],
} as const;

const DE_DAY = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const euro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const metres = (cm: number) => `${new Intl.NumberFormat("de-DE").format(cm / 100)} m`;

export function formatEventDate(iso: string): string {
  return DE_DAY.format(new Date(`${iso}T12:00:00Z`));
}

/** Stall request items that belong to a conversation (form mails: `c-<mailId>`; manual: the id itself). */
export function itemsOfConversation(items: BookingItem[], conversationId: string): BookingItem[] {
  const mailId = conversationId.startsWith("c-") ? conversationId.slice(2) : conversationId;
  return items.filter((i) => i.mailId === mailId || i.mailId === conversationId);
}

/** Values for every variable in this context; null when unknown (the chip turns red). */
export function variableValues(input: {
  demo: MailDemo;
  plan: StandplanData;
  standplan: StandplanState;
  manualItems: BookingItem[];
  conversation: Conversation | null;
  eventId: string | null;
  mailboxId: MailboxId;
  to: { name: string; address: string }[];
  me: Person;
}): Record<string, string | null> {
  const ext = input.conversation?.external ?? input.to[0];
  const parts = (ext?.name ?? "").trim().split(/\s+/).filter(Boolean);
  const ev: PlanEvent | undefined = input.plan.events.find((e) => e.id === input.eventId);
  let stand: string | null = null;
  let standLen: string | null = null;
  if (input.conversation && ev) {
    const item = itemsOfConversation(
      [...input.plan.items, ...input.manualItems],
      input.conversation.id,
    ).find((i) => i.eventId === ev.id);
    const list =
      input.standplan.placements[ev.id] ??
      (input.plan.existing[ev.id] ?? []).map((p) => ({ ...p, status: "fixed" as const }));
    const p = item ? list.find((x) => x.itemId === item.id) : undefined;
    const venue = input.plan.venues.find((v) => v.id === ev.venueId);
    const row = venue?.zones.flatMap((z) => z.rows).find((r) => r.id === p?.rowId);
    if (p && row) {
      stand = stallNumber(row.label, p.startCm);
      standLen = metres(p.endCm - p.startCm);
    } else if (item) {
      standLen = metres(item.lengthCm);
    }
  }
  const mailbox = input.demo.mailboxes.find((m) => m.id === input.mailboxId);
  return {
    Anrede: null,
    Vorname: parts.length > 1 ? (parts[0] ?? null) : null,
    Nachname: parts.length > 1 ? parts.slice(1).join(" ") : (parts[0] ?? null),
    Firma: null,
    Veranstaltung: ev?.name ?? null,
    Datum: ev ? formatEventDate(ev.startsOn) : null,
    Ort: ev?.venueName ?? null,
    Aufbau: ev?.times.setup ? `${ev.times.setup} Uhr` : null,
    Marktzeit: ev?.times.open && ev.times.close ? `${ev.times.open}–${ev.times.close} Uhr` : null,
    PreisProMeter: ev ? euro(ev.pricePerMCents) : null,
    Stand: stand,
    Standlänge: standLen,
    MeinName: input.me.name,
    Postfach: mailbox?.address ?? null,
  };
}
