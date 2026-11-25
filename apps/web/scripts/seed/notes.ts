/**
 * Fahrplan R25 seed: a few "Fürs nächste Mal" notes (research 13 G9), as the team would leave them after a date.
 *
 * Derived here, deterministically (not in the dataset): each note hangs at the market's last date before the
 * reference date (else on the market page, no date), written the evening after that date by the office (or the
 * Platzteam for the on-site ones). One of them is already done. Texts are invented; no real people.
 */

import { schema } from "@marktwerk/db";
import { REFERENCE_DATE } from "@marktwerk/synthetic";
import { eq } from "drizzle-orm";
import { derivedId, insertAll, type SeedContext, type Tx } from "./shared";

type NoteSeed = {
  /** Synthetic preset key. */
  market: string;
  body: string;
  /** Written by the Platzteam on site (else the office). */
  onSite?: boolean;
  done?: boolean;
};

const NOTES: readonly NoteSeed[] = [
  {
    market: "altstadt",
    body: "Strom am Stand 12 fehlt – Verteilerkasten vorher vom Hausmeister prüfen lassen.",
    onSite: true,
  },
  { market: "altstadt", body: "Ordnungsamt will den Lageplan 2 Wochen früher." },
  {
    market: "nippes",
    body: "An der Einfahrt fehlten Halteverbotsschilder, beim nächsten Mal zwei mehr bestellen.",
    onSite: true,
  },
  {
    market: "riehler-guertel",
    body: "Toilettenwagen stand zu weit hinten. Näher an den Eingang stellen.",
    onSite: true,
  },
  {
    market: "riehler-guertel",
    body: "Plakate eine Woche früher aufhängen, viele Aussteller kannten den Termin nicht.",
    done: true,
  },
  { market: "hoffnungsthal", body: "Ortsring möchte die Parkfläche 4 Wochen vorher absprechen." },
];

/** 18:00 Berlin on the day after `date` (summer or winter time, as the date has it). */
function eveningAfter(date: string): Date {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toISOString().slice(0, 10);
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${day}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")
    ?.value.replace("GMT", "");
  return new Date(`${day}T18:00:00${offset || "+01:00"}`);
}

async function userOf(tx: Tx, staffMemberId: string | null | undefined): Promise<string | null> {
  if (!staffMemberId) return null;
  const [row] = await tx
    .select({ userId: schema.staffMember.userId })
    .from(schema.staffMember)
    .where(eq(schema.staffMember.id, staffMemberId));
  return row?.userId ?? null;
}

export async function seedNextTimeNotes(tx: Tx, { data, officeStaffId }: SeedContext) {
  const office = await userOf(tx, officeStaffId);
  const field = await userOf(
    tx,
    data.dutyRoles.find((r) => r.key === "setup_crew")?.defaultStaffMemberId,
  );
  const presetByKey = new Map(data.eventPresets.map((p) => [p.key, p]));

  const rows = NOTES.flatMap((note, i) => {
    const preset = presetByKey.get(note.market);
    if (!preset) return [];
    // The market's last date before the reference date that took place.
    const last = data.events
      .filter(
        (e) => e.presetId === preset.id && e.endsOn < REFERENCE_DATE && e.status !== "cancelled",
      )
      .sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0];
    const author = note.onSite ? (field ?? office) : office;
    const createdAt = last ? eveningAfter(last.endsOn) : new Date(`${REFERENCE_DATE}T09:00:00Z`);
    return [
      {
        id: derivedId("next_time_note", `${note.market}:${i}`),
        presetId: preset.id,
        eventId: last?.id ?? null,
        body: note.body,
        createdById: author,
        createdAt,
        updatedAt: createdAt,
        doneAt: note.done ? createdAt : null,
        doneById: note.done ? office : null,
      },
    ];
  });
  await insertAll(tx, schema.nextTimeNote, rows, "next-time notes");
}
