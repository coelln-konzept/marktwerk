import "server-only";
import { escapeHtml } from "@marktwerk/core";
import { contact, permit, staffMember, vendor, venue } from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type {
  Attachment,
  Conversation,
  KnownSender,
  MailDemo,
  MailTemplate,
  Message,
  Person,
  Signature,
} from "@/components/postfach/types";
import type { StandplanData } from "@/components/standplan/types";
import type { Actor } from "../actor";
import { db } from "../db";
import { loadStandplanDemo } from "../standplan/demo-data";

/**
 * PROTOTYPE: a deterministic demo of the three shared mailboxes, built read-only from the dev data. In the
 * real build these come from Microsoft 365 via Graph (ADR 0008) into email_thread / email_message.
 */

const MAILBOXES: MailDemo["mailboxes"] = [
  { id: "buchung", address: "buchung@coelln-konzept.de", label: "Buchung" },
  { id: "info", address: "info@coelln-konzept.de", label: "Info" },
  { id: "genehmigungen", address: "genehmigungen@coelln-konzept.de", label: "Genehmigungen" },
];

const v = (key: string) => `<span data-variable="${key}"></span>`;

const TEMPLATES: MailTemplate[] = [
  {
    id: "t-bestaetigung",
    name: "Standbestätigung",
    mailboxId: "buchung",
    category: "buchung",
    subject: null,
    html: `<p>Guten Tag ${v("Vorname")} ${v("Nachname")},</p><p>vielen Dank für Ihre Anfrage. Wir bestätigen Ihnen gern einen Stand bei ${v("Veranstaltung")} am ${v("Datum")}: Stand <strong>${v("Stand")}</strong>, ${v("Standlänge")}.</p><p>Bitte bringen Sie diese Bestätigung am Markttag mit.</p>`,
  },
  {
    id: "t-warteliste",
    name: "Warteliste",
    mailboxId: "buchung",
    category: "buchung",
    subject: null,
    html: `<p>Guten Tag ${v("Vorname")} ${v("Nachname")},</p><p>vielen Dank für Ihre Anfrage für ${v("Veranstaltung")} am ${v("Datum")}. Im Moment sind alle Plätze vergeben. Wir haben Sie auf die Warteliste gesetzt und melden uns, sobald ein Platz frei wird.</p>`,
  },
  {
    id: "t-absage",
    name: "Absage (ausgebucht)",
    mailboxId: "buchung",
    category: "buchung",
    subject: null,
    html: `<p>Guten Tag ${v("Vorname")} ${v("Nachname")},</p><p>leider ist ${v("Veranstaltung")} am ${v("Datum")} bereits ausgebucht. Wir würden uns freuen, Sie bei einem unserer nächsten Termine begrüßen zu dürfen.</p>`,
  },
  {
    id: "t-rueckfrage",
    name: "Rückfrage Standlänge",
    mailboxId: "buchung",
    category: "buchung",
    subject: null,
    html: `<p>Guten Tag ${v("Vorname")} ${v("Nachname")},</p><p>vielen Dank für Ihre Anfrage. Damit wir Ihnen einen passenden Platz geben können: Wie viele Meter Stand benötigen Sie, und kommen Sie mit einem Fahrzeug an den Stand?</p>`,
  },
  {
    id: "t-zahlung",
    name: "Zahlungserinnerung",
    mailboxId: "buchung",
    category: "buchung",
    subject: "Zahlungserinnerung",
    html: `<p>Guten Tag ${v("Vorname")} ${v("Nachname")},</p><p>für Ihren Stand bei ${v("Veranstaltung")} am ${v("Datum")} haben wir noch keinen Zahlungseingang gesehen. Bitte überweisen Sie den Betrag bis eine Woche vor dem Markt. Falls Sie bereits gezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.</p>`,
  },
  {
    id: "t-unterlagen",
    name: "Unterlagen nachgereicht",
    mailboxId: "genehmigungen",
    category: "genehmigung",
    subject: null,
    html: "<p>Sehr geehrte Damen und Herren,</p><p>anbei reichen wir die angeforderten Unterlagen nach. Bitte geben Sie uns kurz Bescheid, ob damit alles vollständig ist.</p>",
  },
  {
    id: "t-danke-bescheid",
    name: "Danke für den Bescheid",
    mailboxId: "genehmigungen",
    category: "genehmigung",
    subject: null,
    html: `<p>Sehr geehrte Damen und Herren,</p><p>vielen Dank für die Zusendung des Bescheids für ${v("Veranstaltung")}. Wir haben ihn erhalten und die Auflagen an unser Team weitergegeben.</p>`,
  },
  {
    id: "t-allgemein",
    name: "Allgemeine Antwort",
    mailboxId: null,
    category: "allgemein",
    subject: null,
    html: `<p>Guten Tag ${v("Vorname")} ${v("Nachname")},</p><p>vielen Dank für Ihre Nachricht.</p><p></p>`,
  },
];

const signature = (team: string, mail: string) =>
  `<p>Mit freundlichen Grüßen<br>${v("MeinName")}<br>${team}</p><p>Coelln Konzept GmbH · Märkte im Rheinland<br>${mail} · 0221 123 456 0<br>www.coelln-konzept.de</p>`;

const SIGNATURES: Signature[] = [
  { mailboxId: "buchung", html: signature("Standvergabe", "buchung@coelln-konzept.de") },
  { mailboxId: "info", html: signature("Büro", "info@coelln-konzept.de") },
  {
    mailboxId: "genehmigungen",
    html: signature("Genehmigungen", "genehmigungen@coelln-konzept.de"),
  },
];

/** Plain text → simple HTML paragraphs (incoming demo mails are plain text). */
function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** A tiny but valid one-page PDF with a title, so attachments open in the browser. */
function demoPdf(title: string, line: string): string {
  const esc = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 60 760 Td (${esc(title)}) Tj ET BT /F1 11 Tf 60 730 Td (${esc(line)}) Tj ET BT /F1 9 Tf 60 60 Td (Demo-Anhang aus dem marktwerk-Prototyp) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf, "latin1").toString("base64")}`;
}

function pdfAttachment(id: string, name: string, line: string): Attachment {
  const dataUrl = demoPdf(name.replace(/_/g, " ").replace(/\.pdf$/, ""), line);
  return { id, name, mime: "application/pdf", size: Math.round(dataUrl.length * 0.75), dataUrl };
}

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

export async function loadMailDemo(
  actor: Actor,
  today: string,
): Promise<{ mail: MailDemo; plan: StandplanData }> {
  const { mails: formMails, data: plan } = await loadStandplanDemo(actor, today);
  const rand = rng(4711);
  const now = new Date(`${today}T10:00:00+01:00`).getTime();
  const ago = (hours: number) => new Date(now - hours * 3600_000).toISOString();

  const staff = await db
    .select({ id: staffMember.id, name: staffMember.displayName })
    .from(staffMember)
    .where(eq(staffMember.active, true))
    .orderBy(asc(staffMember.displayName))
    .limit(12);
  const me: Person = { id: actor.staffMemberId ?? actor.id, name: actor.displayName };
  const people: Person[] = [me, ...staff.filter((s) => s.id !== me.id)];
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)] as T;
  const someone = () => (rand() < 0.3 ? null : pick(people).id);

  const box = (id: "buchung" | "info" | "genehmigungen") => {
    const b = MAILBOXES.find((m) => m.id === id);
    if (!b) throw new Error(id);
    return { name: `Coelln Konzept – ${b.label}`, address: b.address };
  };

  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const add = (
    c: Omit<Conversation, "lastActivityAt" | "unread"> & { unread?: boolean },
    msgs: Omit<Message, "conversationId">[],
  ) => {
    const last = msgs.reduce((a, m) => (m.at > a ? m.at : a), "");
    conversations.push({ unread: c.unread ?? true, ...c, lastActivityAt: last });
    for (const m of msgs) messages.push({ ...m, conversationId: c.id });
  };

  // 1) Website-form requests (from the Standplan loader).
  for (const m of formMails) {
    if (m.parse.kind !== "request") continue;
    const req = m.parse.ok ? m.parse.request : m.parse.partial;
    const external = { name: req.name || m.fromName, address: req.email || m.fromAddress };
    const ev = plan.items.find((i) => i.mailId === m.id)?.eventId ?? null;
    add(
      {
        id: `c-${m.id}`,
        mailboxId: "buchung",
        subject: m.subject,
        external,
        status: "offen",
        assigneeId: null,
        eventId: ev,
      },
      [
        {
          id: m.id,
          kind: "incoming",
          from: { name: m.fromName, address: m.fromAddress },
          to: [box("buchung")],
          cc: [],
          html: textToHtml(m.body),
          text: m.body,
          attachments: [],
          at: m.receivedAt,
          parse: m.parse,
        },
      ],
    );
  }

  // 2) Free-text requests from real vendors; three already have our reply and a follow-up.
  const vendors = await db
    .select({
      name: vendor.displayName,
      first: vendor.firstName,
      last: vendor.lastName,
      email: vendor.email,
    })
    .from(vendor)
    .where(isNotNull(vendor.email))
    .orderBy(asc(vendor.legacyId))
    .limit(6)
    .offset(700);
  const withRows = plan.events.filter((e) => plan.venues.some((x) => x.id === e.venueId));
  const freeTexts = [
    (e: string, d: string) =>
      `Hallo,\n\nhabt ihr am ${d} beim ${e} noch 4 m frei? Ich komme mit meinem Bulli, der müsste hinter den Stand.\n\nViele Grüße`,
    (e: string, d: string) =>
      `Guten Tag,\n\nich würde gerne am ${d} (${e}) einen Stand mit Kinderkleidung und Spielzeug machen, ca. 3 Meter. Strom brauche ich nicht.\n\nDanke und Gruß`,
    (e: string, d: string) =>
      `Moin,\n\nwir sind zu zweit und bräuchten beim ${e} am ${d} etwa 6 m, gern wieder an der gleichen Stelle wie letztes Jahr (Reihe B).\n\nLG`,
    (e: string, d: string) =>
      `Sehr geehrte Damen und Herren,\n\nist für den ${e} am ${d} noch ein Platz für Antiquitäten frei? Ich bräuchte 5 m und einen Stromanschluss für eine Vitrine.\n\nMit freundlichen Grüßen`,
    (e: string, d: string) =>
      `Hallo zusammen,\n\nkann ich mich für den ${e} am ${d} noch anmelden? 2 m reichen mir.\n\nGruß`,
  ];
  vendors.slice(0, 5).forEach((vd, i) => {
    const ev = withRows[i % Math.max(withRows.length, 1)];
    if (!ev || !vd.email) return;
    const name = [vd.first, vd.last].filter(Boolean).join(" ") || vd.name;
    const external = { name, address: vd.email };
    const subject = `Standplatz ${ev.name} ${deDate(ev.startsOn)}`;
    const firstText = `${(freeTexts[i] ?? freeTexts[0])?.(ev.name, deDate(ev.startsOn))}\n${name}`;
    const id = `c-frei-${i + 1}`;
    const msgs: Omit<Message, "conversationId">[] = [
      {
        id: `${id}-1`,
        kind: "incoming",
        from: external,
        to: [box("buchung")],
        cc: [],
        html: textToHtml(firstText),
        text: firstText,
        attachments: [],
        at: ago(70 - i * 9),
      },
    ];
    const answered = i < 3;
    if (answered) {
      const reply = `Guten Tag ${name},\n\nvielen Dank für Ihre Anfrage. Damit wir Ihnen einen passenden Platz geben können: Wie viele Meter Stand benötigen Sie, und kommen Sie mit einem Fahrzeug an den Stand?\n\nMit freundlichen Grüßen\nIhr Team von Coelln Konzept`;
      msgs.push({
        id: `${id}-2`,
        kind: "outgoing",
        from: box("buchung"),
        to: [external],
        cc: [],
        html: textToHtml(reply),
        text: reply,
        attachments: [],
        at: ago(50 - i * 9),
        authorId: pick(people).id,
      });
      const follow = `Hallo,\n\ndanke für die schnelle Antwort! ${i === 0 ? "5 m wären super, das Auto ist ein VW T5 (ca. 5 m)." : i === 1 ? "3 m reichen, ohne Auto." : "6 m, Auto parken wir woanders."}\n\nGruß\n${name}`;
      msgs.push({
        id: `${id}-3`,
        kind: "incoming",
        from: external,
        to: [box("buchung")],
        cc: [],
        html: textToHtml(follow),
        text: follow,
        attachments: [],
        at: ago(20 - i * 4),
      });
    }
    add(
      {
        id,
        mailboxId: "buchung",
        subject,
        external,
        status: "offen",
        assigneeId: answered ? (msgs[1]?.authorId ?? null) : null,
        eventId: answered ? ev.id : null,
      },
      msgs,
    );
  });

  // 3) Authorities (known contacts) with permit documents, plus one unknown sender.
  const authorities = await db
    .select({ id: contact.id, name: contact.name, email: contact.email })
    .from(contact)
    .where(and(eq(contact.kind, "authority"), isNotNull(contact.email), isNull(contact.archivedAt)))
    .orderBy(asc(contact.name))
    .limit(3);
  const authorityMails = [
    {
      subject: "Bescheid Sondernutzungserlaubnis",
      file: "Bescheid_Sondernutzung",
      text: "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie den Bescheid über die Sondernutzungserlaubnis für Ihre Veranstaltung. Bitte beachten Sie die Auflagen auf Seite 2 (Rettungswege mind. 3,50 m frei halten).\n\nMit freundlichen Grüßen\nIm Auftrag\nS. Kramer",
    },
    {
      subject: "Verkehrsrechtliche Anordnung (Halteverbot)",
      file: "Verkehrsrechtliche_Anordnung",
      text: "Guten Tag,\n\ndie verkehrsrechtliche Anordnung für das Halteverbot am Veranstaltungstag ist erteilt, siehe Anlage. Die Schilder sind 72 Stunden vorher aufzustellen.\n\nFreundliche Grüße\nAmt für Straßen und Verkehr",
    },
    {
      subject: "Rückfrage zu Ihrem Antrag – Lageplan",
      file: null,
      text: "Sehr geehrte Damen und Herren,\n\nfür Ihren Antrag benötigen wir noch einen aktuellen Lageplan mit eingezeichneten Rettungswegen (Maßstab 1:500). Bitte reichen Sie diesen bis Freitag nach.\n\nMit freundlichen Grüßen\nOrdnungsamt",
    },
  ];
  authorities.forEach((a, i) => {
    const m = authorityMails[i];
    if (!m || !a.email) return;
    const external = { name: a.name, address: a.email };
    const id = `c-amt-${i + 1}`;
    const place =
      a.name
        .split("–")[0]
        ?.replace(/Ordnungsamt|Amt für Straßen und Verkehr/g, "")
        .trim() || "Ort";
    add(
      {
        id,
        mailboxId: "genehmigungen",
        subject: m.subject,
        external,
        status: i === 2 ? "wartet" : "offen",
        assigneeId: someone(),
        eventId: null,
        unread: i !== 2,
      },
      [
        {
          id: `${id}-1`,
          kind: "incoming",
          from: external,
          to: [box("genehmigungen")],
          cc: [],
          html: textToHtml(m.text),
          text: m.text,
          attachments: m.file
            ? [
                pdfAttachment(
                  `${id}-a1`,
                  `${m.file}_${place.replace(/\s+/g, "_")}.pdf`,
                  `${m.subject} – ${a.name}`,
                ),
              ]
            : [],
          at: ago(30 + i * 22),
        },
      ],
    );
  });
  {
    const text =
      "Sehr geehrte Damen und Herren,\n\nwir sind der neue Ansprechpartner für die Fläche am Rheinufer. Anbei unser Mustervertrag für die Nutzung als Marktfläche ab der Saison 2027. Über eine Rückmeldung freuen wir uns.\n\nMit freundlichen Grüßen\nMarkus Lenz\nRheinufer Immobilien GmbH\nUferstraße 12\n53111 Bonn\nTel. 0228 987654-0";
    const external = { name: "Markus Lenz", address: "m.lenz@rheinufer-immobilien.example" };
    add(
      {
        id: "c-amt-neu",
        mailboxId: "genehmigungen",
        subject: "Nutzungsvertrag Rheinufer ab 2027",
        external,
        status: "offen",
        assigneeId: null,
        eventId: null,
      },
      [
        {
          id: "c-amt-neu-1",
          kind: "incoming",
          from: external,
          to: [box("genehmigungen")],
          cc: [],
          html: textToHtml(text),
          text,
          attachments: [
            pdfAttachment(
              "c-amt-neu-a1",
              "Mustervertrag_Rheinufer_2027.pdf",
              "Nutzungsvertrag Marktflaeche",
            ),
          ],
          at: ago(8),
        },
      ],
    );
  }

  // 4) info@: suppliers, invoices, questions.
  const infoMails: {
    from: { name: string; address: string };
    subject: string;
    text: string;
    status: Conversation["status"];
    file?: string;
  }[] = [
    {
      from: { name: "Lars Becker", address: "lars@standbau.example" },
      subject: "Pavillons fürs Wochenende – Anzahl?",
      text: "Hi,\n\nwie viele Pavillons braucht ihr am Wochenende? Ich plane gerade die Tour.\n\nGruß Lars\nBecker Standbau\nMobil: +49 171 2345678",
      status: "offen",
    },
    {
      from: { name: "Stadtwerke Troisdorf", address: "rechnung@stadtwerke.example" },
      subject: "Rechnung Stromanschluss Oktober",
      text: "Sehr geehrte Kundin, sehr geehrter Kunde,\n\nanbei Ihre Rechnung Nr. 2026-10-4471 über 312,40 € für den Stromanschluss am Marktplatz.\n\nIhre Stadtwerke",
      status: "erledigt",
      file: "Rechnung_2026-10-4471.pdf",
    },
    {
      from: { name: "Petra Hoffmann", address: "petra.hoffmann@example.com" },
      subject: "Frage zu Standgebühr",
      text: "Hallo,\n\nich habe letztes Mal 15 € pro Meter bezahlt. Gilt das auch für den Antikmarkt? Und kann ich bar bezahlen?\n\nViele Grüße, Petra Hoffmann",
      status: "offen",
    },
    {
      from: { name: "Toilettenservice Rhein", address: "dispo@toiletten-rhein.example" },
      subject: "Angebot Toilettenwagen Saison 2027",
      text: "Guten Tag,\n\nwie besprochen erhalten Sie unser Angebot für die Saison 2027 (12 Einsätze, Toilettenwagen 2+2, inkl. Reinigung).\n\nMit freundlichen Grüßen\nToilettenservice Rhein GmbH\nIndustriestraße 4\n50996 Köln\nTel. 0221 556677",
      status: "wartet",
      file: "Angebot_Toilettenwagen_2027.pdf",
    },
  ];
  infoMails.forEach((m, i) => {
    const id = `c-info-${i + 1}`;
    add(
      {
        id,
        mailboxId: "info",
        subject: m.subject,
        external: m.from,
        status: m.status,
        assigneeId: m.status === "offen" ? null : pick(people).id,
        eventId: null,
        unread: m.status === "offen",
      },
      [
        {
          id: `${id}-1`,
          kind: "incoming",
          from: m.from,
          to: [box("info")],
          cc: [],
          html: textToHtml(m.text),
          text: m.text,
          attachments: m.file ? [pdfAttachment(`${id}-a1`, m.file, m.subject)] : [],
          at: ago(12 + i * 17),
        },
      ],
    );
  });

  // Sender recognition: read-only lookup in contacts and vendors.
  const addresses = [...new Set(conversations.map((c) => c.external.address.toLowerCase()))];
  const [knownContacts, knownVendors] = await Promise.all([
    db
      .select({ id: contact.id, name: contact.name, email: contact.email, kind: contact.kind })
      .from(contact)
      .where(inArray(contact.email, addresses)),
    db
      .select({
        id: vendor.id,
        name: vendor.displayName,
        email: vendor.email,
        isRegular: vendor.isRegular,
      })
      .from(vendor)
      .where(inArray(vendor.email, addresses)),
  ]);
  const knownSenders: KnownSender[] = [
    ...knownContacts.map((c) => ({
      address: (c.email ?? "").toLowerCase(),
      kind: "contact" as const,
      label: c.name,
      id: c.id,
    })),
    ...knownVendors.map((x) => ({
      address: (x.email ?? "").toLowerCase(),
      kind: "vendor" as const,
      label: `${x.name}${x.isRegular ? " · Stammaussteller" : ""}`,
      id: x.id,
    })),
  ];

  const venueIds = [...new Set(plan.events.map((e) => e.venueId))];
  const [permits, venues] = await Promise.all([
    venueIds.length
      ? db
          .select({
            id: permit.id,
            venueId: permit.venueId,
            title: permit.title,
            status: permit.status,
            season: permit.season,
          })
          .from(permit)
          .where(inArray(permit.venueId, venueIds))
          .orderBy(asc(permit.title))
      : Promise.resolve([]),
    db.select({ id: venue.id, name: venue.name }).from(venue).orderBy(asc(venue.name)),
  ]);

  return {
    plan,
    mail: {
      mailboxes: MAILBOXES,
      conversations: conversations.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
      messages,
      templates: TEMPLATES,
      signatures: SIGNATURES,
      knownSenders,
      people,
      me,
      permits: permits.flatMap((p) => (p.venueId ? [{ ...p, venueId: p.venueId }] : [])),
      venues,
    },
  };
}
