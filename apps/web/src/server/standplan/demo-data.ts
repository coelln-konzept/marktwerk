import "server-only";
import { parseStallRequestMail } from "@marktwerk/core";
import { event, vendor, venue, venueRow, zone } from "@marktwerk/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import type {
  BookingItem,
  ExistingPlacement,
  InboxMail,
  PlanEvent,
  PlanVenue,
  StandplanData,
} from "@/components/standplan/types";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";

/**
 * PROTOTYPE: builds a demo mailbox and stall plans from the real dev data (events, venues, rows,
 * vendors), read-only. Nothing is written to the database. In the real build the mails come from the
 * Microsoft 365 booking mailbox (ADR 0008) and the requests are `booking_request` / `booking_date` rows.
 */

/** Small seeded PRNG so the demo mailbox is the same on every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const deDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const NOTES = [
  "Bitte möglichst neben Stand von Familie Krämer, wir teilen uns den Pavillon.",
  "Ich komme mit einem Sprinter (6 m). Geht das?",
  "Gerne am Rand, ich habe einen Kleiderständer dabei.",
  "Wir sind zum ersten Mal dabei – gibt es eine Ecke im Schatten?",
  "Bitte nicht direkt neben dem Imbiss.",
  "Aufbau erst ab 7 Uhr möglich, Anreise aus Aachen.",
  null,
  null,
  null,
];

/** People who have never booked: they are not in the vendor table yet. */
const NEWCOMERS = [
  ["Lena", "Brückner"],
  ["Tobias", "Kaminski"],
  ["Hatice", "Yıldız"],
  ["Jonas", "Feldhaus"],
  ["Marie", "Ostendorf"],
  ["Dariusz", "Nowak"],
  ["Sophie", "Lindqvist"],
  ["Emre", "Aksoy"],
  ["Clara", "Wiedemann"],
  ["Felix", "Rothkirch"],
  ["Ines", "Marquardt"],
  ["Paul", "Achterberg"],
] as const;

const CATEGORIES = [
  ["Trödel"],
  ["Trödel", "Bücher"],
  ["Kinderkleidung", "Spielzeug"],
  ["Antiquitäten"],
  ["Schallplatten", "Bücher"],
  ["Neuware"],
  ["Kunsthandwerk"],
];

function formMail(input: {
  id: string;
  eventName: string;
  dates: string[];
  name: string;
  company: string | null;
  kind: "private" | "commercial";
  email: string;
  phone: string | null;
  lengthCm: number;
  car: boolean;
  carLengthCm: number | null;
  power: boolean;
  categories: string[];
  spot: string | null;
  note: string | null;
  ref: string;
  receivedAt: string;
}): Omit<InboxMail, "parse"> {
  const m = (cm: number) => `${String(cm / 100).replace(".", ",")} m`;
  const lines = [
    "Neue Standanfrage über das Formular auf coelln-konzept.de",
    "---",
    `Veranstaltung: ${input.eventName}`,
    `Termine: ${input.dates.map(deDate).join(", ")}`,
    `Name: ${input.name}`,
    `Firma: ${input.company ?? ""}`,
    `Art: ${input.kind === "commercial" ? "gewerblich" : "privat"}`,
    `E-Mail: ${input.email}`,
    `Telefon: ${input.phone ?? ""}`,
    `Standlänge: ${m(input.lengthCm)}`,
    `Auto am Stand: ${input.car ? "ja" : "nein"}`,
    ...(input.car && input.carLengthCm ? [`Autolänge: ${m(input.carLengthCm)}`] : []),
    `Strom: ${input.power ? "ja" : "nein"}`,
    `Sortiment: ${input.categories.join(", ")}`,
    `Stammplatz: ${input.spot ?? ""}`,
    `Anmerkung: ${input.note ?? ""}`,
    "---",
    `Anfrage-ID: ${input.ref}`,
    "",
    "Diese E-Mail wurde automatisch erzeugt.",
  ];
  return {
    id: input.id,
    messageId: `<${input.ref.toLowerCase()}@formular.coelln-konzept.de>`,
    fromName: "Website-Formular",
    fromAddress: "formular@coelln-konzept.de",
    subject: `Standanfrage – ${input.eventName} – ${input.dates.map(deDate).join(", ")}`,
    receivedAt: input.receivedAt,
    body: lines.join("\n"),
  };
}

const OTHER_MAILS: Omit<InboxMail, "parse" | "id" | "receivedAt" | "messageId">[] = [
  {
    fromName: "Stadt Köln – Ordnungsamt",
    fromAddress: "sondernutzung@stadt-koeln.example",
    subject: "Sondernutzungserlaubnis Heumarkt – Unterlagen unvollständig",
    body: "Sehr geehrte Damen und Herren,\n\nfür Ihren Antrag fehlt uns noch der aktuelle Lageplan mit Rettungswegen (Maßstab 1:500).\nBitte reichen Sie diesen bis Freitag nach.\n\nMit freundlichen Grüßen\nOrdnungsamt",
  },
  {
    fromName: "Lars Becker",
    fromAddress: "lars@standbau.example",
    subject: "Pavillons für Antikmarkt – Anzahl?",
    body: "Hi, wie viele Pavillons braucht ihr am Wochenende? Ich plane gerade die Tour.\nGruß Lars",
  },
  {
    fromName: "Petra Hoffmann",
    fromAddress: "petra.hoffmann@example.com",
    subject: "Frage zu Standgebühr",
    body: "Hallo, ich habe letztes Mal 15 € pro Meter bezahlt. Gilt das auch für den Antikmarkt? Und kann ich bar bezahlen?\nViele Grüße, Petra Hoffmann",
  },
  {
    fromName: "Stadtwerke",
    fromAddress: "rechnung@stadtwerke.example",
    subject: "Rechnung Stromanschluss Oktober",
    body: "Anbei Ihre Rechnung Nr. 2026-10-4471 über 312,40 € für den Stromanschluss am Marktplatz.",
  },
];

/** Loads everything the two prototype screens need. */
export async function loadStandplanDemo(
  actor: Actor,
  today: string,
): Promise<{
  mails: InboxMail[];
  data: StandplanData;
}> {
  const eventsRaw = await db
    .select({
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      venueId: event.venueId,
      venueName: venue.name,
      pricePerMCents: event.pricePerMCents,
      bookingFeeCents: event.bookingFeeCents,
      times: event.times,
    })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(and(visibleEvents(actor), gte(event.startsOn, today), ne(event.status, "cancelled")))
    .orderBy(asc(event.startsOn))
    .limit(24);
  const events: PlanEvent[] = eventsRaw.map((e) => ({ ...e, times: e.times ?? {} }));

  const venueIds = [...new Set(events.map((e) => e.venueId))];
  const venueRows = venueIds.length
    ? await db
        .select({
          venueId: zone.venueId,
          venueName: venue.name,
          zoneId: zone.id,
          zoneName: zone.name,
          zoneSort: zone.sort,
          id: venueRow.id,
          label: venueRow.label,
          lengthCm: venueRow.lengthCm,
          depthCm: venueRow.depthCm,
          carAllowed: venueRow.carAllowed,
          carSlots: venueRow.carSlots,
          power: venueRow.power,
          sort: venueRow.sort,
        })
        .from(venueRow)
        .innerJoin(zone, eq(zone.id, venueRow.zoneId))
        .innerJoin(venue, eq(venue.id, zone.venueId))
        .where(inArray(zone.venueId, venueIds))
        .orderBy(asc(zone.sort), asc(venueRow.sort), asc(venueRow.label))
    : [];
  const venues = new Map<string, PlanVenue>();
  for (const r of venueRows) {
    let v = venues.get(r.venueId);
    if (!v) {
      v = { id: r.venueId, name: r.venueName, zones: [] };
      venues.set(r.venueId, v);
    }
    let z = v.zones.find((x) => x.id === r.zoneId);
    if (!z) {
      z = { id: r.zoneId, name: r.zoneName, rows: [] };
      v.zones.push(z);
    }
    z.rows.push({
      id: r.id,
      zoneId: r.zoneId,
      label: r.label,
      lengthCm: r.lengthCm,
      depthCm: r.depthCm,
      carAllowed: r.carAllowed,
      carSlots: r.carSlots,
      power: r.power,
    });
  }

  const vendors = await db
    .select({
      displayName: vendor.displayName,
      firstName: vendor.firstName,
      lastName: vendor.lastName,
      companyName: vendor.companyName,
      kind: vendor.kind,
      email: vendor.email,
      phone: vendor.phoneE164,
      categories: vendor.categories,
      regularSpot: vendor.regularSpot,
      defaultLengthCm: vendor.defaultLengthCm,
      hasCar: vendor.hasCar,
      carLengthCm: vendor.carLengthCm,
    })
    .from(vendor)
    .where(isNotNull(vendor.email))
    .orderBy(asc(vendor.legacyId))
    .limit(400);

  const rand = rng(20261104);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)] as T;
  const now = new Date(`${today}T09:00:00+01:00`).getTime();
  const mails: Omit<InboxMail, "parse">[] = [];
  let vi = 0;
  let newcomer = 0;
  let ref = 1;
  const nextVendor = () => vendors[vi++ % Math.max(vendors.length, 1)];

  // Requests for the next four events with rows; a few of them for two dates of the same series.
  const withRows = events.filter((e) => venues.has(e.venueId)).slice(0, 4);
  for (const ev of withRows) {
    const sameSeries = events.find((o) => o.id !== ev.id && o.name === ev.name);
    const count = 9 + Math.floor(rand() * 5);
    for (let i = 0; i < count; i++) {
      const real = nextVendor();
      if (!real?.email) continue;
      // About a third of the requests come from people who have never booked (not in the vendor table).
      const nc = rand() < 0.3 ? NEWCOMERS[newcomer++ % NEWCOMERS.length] : undefined;
      const v = nc
        ? {
            ...real,
            firstName: nc[0],
            lastName: nc[1],
            displayName: `${nc[0]} ${nc[1]}`,
            companyName: null,
            kind: "private" as const,
            email: `${nc[0]}.${nc[1]}`
              .toLowerCase()
              .normalize("NFKD")
              .replace(/[^\x20-\x7e]/g, "")
              .concat("@web-mail.example"),
            phone: null,
            regularSpot: null,
            isRegular: false,
          }
        : real;
      const two = sameSeries && rand() < 0.2;
      const lengthCm = v.defaultLengthCm ?? pick([200, 300, 300, 400, 400, 500, 600]);
      const car = v.hasCar && rand() < 0.6;
      mails.push(
        formMail({
          id: `m${mails.length + 1}`,
          eventName: ev.name,
          dates: two ? [ev.startsOn, sameSeries.startsOn] : [ev.startsOn],
          name: [v.firstName, v.lastName].filter(Boolean).join(" ") || v.displayName,
          company: v.kind === "commercial" ? (v.companyName ?? v.displayName) : null,
          kind: v.kind,
          email: v.email ?? "",
          phone: v.phone,
          lengthCm,
          car,
          carLengthCm: car ? (v.carLengthCm ?? 500) : null,
          power: rand() < 0.15,
          categories: v.categories.length ? v.categories : pick(CATEGORIES),
          spot: v.regularSpot && rand() < 0.7 ? v.regularSpot : null,
          note: pick(NOTES),
          ref: `CK-2026-${String(ref++).padStart(6, "0")}`,
          receivedAt: new Date(now - Math.floor(rand() * 9 * 24 * 60) * 60_000).toISOString(),
        }),
      );
    }
  }
  // One mail whose template changed (shows the parse-error path).
  if (withRows[0] && vendors.length > 0) {
    const broken = formMail({
      id: `m${mails.length + 1}`,
      eventName: withRows[0].name,
      dates: [withRows[0].startsOn],
      name: "Jürgen Weber",
      company: null,
      kind: "private",
      email: "juergen.weber@example.com",
      phone: null,
      lengthCm: 300,
      car: false,
      carLengthCm: null,
      power: false,
      categories: ["Trödel"],
      spot: null,
      note: null,
      ref: `CK-2026-${String(ref++).padStart(6, "0")}`,
      receivedAt: new Date(now - 3 * 3600_000).toISOString(),
    });
    broken.body = broken.body
      .replace("Standlänge: 3 m", "Standlänge: drei Meter")
      .replace(/Termine: .*/, "Termine: 31.11.2026");
    mails.push(broken);
  }
  OTHER_MAILS.forEach((m, i) => {
    mails.push({
      ...m,
      id: `m${mails.length + 1}`,
      messageId: `<other-${i}@example>`,
      receivedAt: new Date(now - (i * 31 + 5) * 3600_000).toISOString(),
    });
  });

  const parsed: InboxMail[] = mails
    .map((m) => ({ ...m, parse: parseStallRequestMail(m) }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  // Split requests per date and match them to events (name + date).
  const items: BookingItem[] = [];
  const unmatched: StandplanData["unmatched"] = [];
  for (const m of parsed) {
    if (m.parse.kind !== "request" || !m.parse.ok) continue;
    const r = m.parse.request;
    for (const date of r.dates) {
      const ev = events.find((e) => e.name === r.eventName && e.startsOn === date);
      if (!ev) {
        unmatched.push({ mailId: m.id, eventName: r.eventName, date });
        continue;
      }
      items.push({
        id: `${m.id}:${ev.id}`,
        mailId: m.id,
        eventId: ev.id,
        vendorName: r.name,
        companyName: r.companyName,
        email: r.email,
        phone: r.phone,
        kind: r.kind,
        lengthCm: r.lengthCm,
        carRequested: r.carRequested,
        carLengthCm: r.carLengthCm,
        power: r.power,
        categories: r.categories,
        preferredRowLabel: r.preferredSpot?.rowLabel ?? null,
        preferredOffsetCm: r.preferredSpot?.offsetCm ?? null,
        preferredRaw: r.preferredSpot?.raw ?? null,
        note: r.note,
        receivedAt: m.receivedAt,
        requestRef: r.requestRef,
        knownVendor: false, // set below from the vendor table
      });
    }
  }

  // Existing (already confirmed) bookings fill about a third of each plan, so placing is realistic.
  const existing: Record<string, ExistingPlacement[]> = {};
  let n = 0;
  for (const ev of events) {
    const v = venues.get(ev.venueId);
    if (!v) continue;
    const rows = v.zones.flatMap((z) => z.rows);
    const list: ExistingPlacement[] = [];
    for (const row of rows) {
      let cursor = rand() < 0.5 ? 0 : 300;
      while (true) {
        if (rand() < 0.45) cursor += pick([300, 400, 600, 800]); // free gaps stay
        const vd = nextVendor();
        if (!vd) break;
        const len = vd.defaultLengthCm ?? pick([200, 300, 400, 500]);
        if (cursor + len > row.lengthCm || rand() < 0.08) break;
        const id = `bestand:${++n}`;
        items.push({
          id,
          mailId: null,
          eventId: ev.id,
          vendorName: vd.displayName,
          companyName: vd.companyName,
          email: vd.email ?? "",
          phone: vd.phone,
          kind: vd.kind,
          lengthCm: len,
          carRequested: false,
          carLengthCm: null,
          power: false,
          categories: vd.categories,
          preferredRowLabel: null,
          preferredOffsetCm: null,
          preferredRaw: null,
          note: null,
          receivedAt: new Date(now - 30 * 24 * 3600_000).toISOString(),
          requestRef: `ALT-${n}`,
          knownVendor: true,
        });
        list.push({ itemId: id, rowId: row.id, startCm: cursor, endCm: cursor + len, car: false });
        cursor += len;
      }
    }
    existing[ev.id] = list;
  }
  // Which senders are already vendors (read-only lookup by email).
  const mailEmails = [...new Set(items.filter((i) => i.mailId).map((i) => i.email.toLowerCase()))];
  const known = new Set(
    mailEmails.length
      ? (
          await db
            .select({ email: vendor.email })
            .from(vendor)
            .where(inArray(vendor.email, mailEmails))
        ).map((x) => (x.email ?? "").toLowerCase())
      : [],
  );
  for (const i of items) if (i.mailId) i.knownVendor = known.has(i.email.toLowerCase());

  const placedIds = new Set(Object.values(existing).flatMap((l) => l.map((p) => p.itemId)));
  const finalItems = items.filter((i) => i.mailId !== null || placedIds.has(i.id));

  return {
    mails: parsed,
    data: {
      events,
      venues: [...venues.values()],
      items: finalItems,
      existing,
      unmatched,
      vendors: vendors.map((v) => ({
        name:
          v.displayName ??
          ([v.firstName, v.lastName].filter(Boolean).join(" ") || v.companyName || v.email || ""),
        companyName: v.companyName,
        email: v.email ?? "",
        phone: v.phone,
        kind: v.kind === "commercial" ? ("commercial" as const) : ("private" as const),
        categories: v.categories ?? [],
        defaultLengthCm: v.defaultLengthCm,
        hasCar: Boolean(v.hasCar),
        carLengthCm: v.carLengthCm,
      })),
    },
  };
}
