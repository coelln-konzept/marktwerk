import type { CalendarItem, CalendarLayer } from "@/server/queries/due";

/** What a permit entry of the Kalender is about, read from the id suffix `permits.calendarItems` sets. */
export type DeadlineKind = "apply" | "decision" | "expires";

export function deadlineKind(item: Pick<CalendarItem, "layer" | "id">): DeadlineKind | null {
  if (item.layer !== "permits") return null;
  const suffix = item.id.split(":")[1];
  return suffix === "apply" || suffix === "decision" || suffix === "expires" ? suffix : null;
}

/** An entry as the Kalender shows it: a single item, or one summary standing for several. */
export type GroupedItem = CalendarItem & {
  /** Set on a summary of `count` items of one day, layer, kind and urgency; `members` are those items. */
  group?: { count: number; kind: DeadlineKind | null; members: CalendarItem[] };
};

/** An entry with its texts already translated (done once by the page, used by chip and list row). */
export type DisplayItem = GroupedItem & {
  /** Chip / row text: the object first ("Ort · Genehmigung"), or the summary sentence. */
  text: string;
  /** The verb ("Entscheidung erwartet"), shown after the object and in the tooltip. */
  kindLabel?: string;
  /** Shorter text for a month-grid chip: the venue cut to its town ("Neuss · Marktgenehmigung", UT-11 #4). */
  shortText?: string;
  /** A summary's members with their own texts and links (opened by the summary, UT-11 #2). */
  members?: { key: string; href: string; text: string }[];
};

/** Layers that have a page a summary can link to. */
const GROUP_HREF: Partial<Record<CalendarLayer, string>> = {
  permits: "/genehmigungen",
  tasks: "/board",
};

/** From this many items of one day, layer, kind and urgency on, the Kalender shows one summary. */
export const GROUP_MIN = 4;

/**
 * Collapses same-day, same-layer, same-kind, same-urgency items into one entry (70 permits whose
 * decision is expected on one Monday must not fill the month). Urgency is part of the key, so an
 * overdue item is never hidden inside a calm summary. Order is kept; a summary takes the place of its
 * first member. Layers without a page to link to stay as they are.
 */
export function groupDeadlines(items: CalendarItem[], min = GROUP_MIN): GroupedItem[] {
  const keyOf = (i: CalendarItem) =>
    `${i.date}|${i.layer}|${deadlineKind(i) ?? ""}|${i.tone ?? "neutral"}`;
  const members = new Map<string, CalendarItem[]>();
  for (const i of items) {
    if (GROUP_HREF[i.layer]) members.set(keyOf(i), [...(members.get(keyOf(i)) ?? []), i]);
  }
  const done = new Set<string>();
  const out: GroupedItem[] = [];
  for (const i of items) {
    const key = keyOf(i);
    const href = GROUP_HREF[i.layer];
    const group = members.get(key) ?? [];
    const count = group.length;
    if (!href || count < min) {
      out.push(i);
      continue;
    }
    if (done.has(key)) continue;
    done.add(key);
    out.push({
      ...i,
      id: `group:${key}`,
      href,
      group: { count, kind: deadlineKind(i), members: group },
    });
  }
  return out;
}

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/**
 * Text of a single entry with the object first: permit titles read "Verb: Genehmigung · Ort" and are
 * cut to "Entscheid…" in a chip; here they become "Ort · Genehmigung" (the verb follows separately).
 * ISO dates that crept into titles are written the German way.
 */
export function deadlineText(item: CalendarItem): string {
  let text = item.title;
  if (deadlineKind(item)) {
    const rest = item.title.replace(/^[^:]+:\s*/, "");
    const i = rest.lastIndexOf(" · ");
    text = i > 0 ? `${rest.slice(i + 3)} · ${rest.slice(0, i)}` : rest;
  }
  return text.replace(ISO_DATE, (_, y, m, d) => `${d}.${m}.${y}`);
}

/**
 * `deadlineText` for a narrow month-grid cell: a permit's venue ("Bergisch Gladbach – Konrad-Adenauer-Platz")
 * is cut to the part before " – ", so the chip still says where and what. Other texts stay as they are.
 */
export function deadlineShortText(item: CalendarItem): string {
  const text = deadlineText(item);
  if (!deadlineKind(item)) return text;
  const i = text.indexOf(" · ");
  if (i <= 0) return text;
  const venue = text.slice(0, i);
  const dash = venue.indexOf(" – ");
  return dash > 0 ? `${venue.slice(0, dash)}${text.slice(i)}` : text;
}
