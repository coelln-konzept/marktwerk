import { daysBetween } from "../dates/calendar";

/**
 * Text of the emails (plain text, German, "du"): the daily digest and the immediate mail for escalations.
 * Pure, so the job and the tests render the same thing.
 */

export type DigestUrgency = "overdue" | "today" | "soon";

export type DigestItem = {
  kind: "task" | "permit";
  title: string;
  /** YYYY-MM-DD */
  dueOn: string;
  urgency: DigestUrgency;
  /** App-relative link. */
  href: string;
  /** What it belongs to, e.g. the event or venue name. */
  context?: string | null;
};

/** Items due within this many days are in the digest ("diese Woche"). */
export const DIGEST_HORIZON_DAYS = 7;

/** overdue / today / soon (within the horizon); null if it is further away. */
export function digestUrgency(dueOn: string, today: string): DigestUrgency | null {
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= DIGEST_HORIZON_DAYS ? "soon" : null;
}

const germanDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;

const absolute = (baseUrl: string, href: string) => `${baseUrl.replace(/\/+$/, "")}${href}`;

const ORDER: DigestUrgency[] = ["overdue", "today", "soon"];

const HEADINGS: Record<DigestUrgency, string> = {
  overdue: "Überfällig",
  today: "Heute fällig",
  soon: "Diese Woche",
};

const KIND: Record<DigestItem["kind"], string> = { task: "Aufgabe", permit: "Genehmigung" };

export type RenderedMail = { subject: string; text: string };

/**
 * The morning mail of one person: overdue, due today, due this week. Null when there is nothing to
 * report (no mail is sent then).
 */
export function renderDigest(input: {
  firstName: string;
  today: string;
  items: readonly DigestItem[];
  baseUrl: string;
}): RenderedMail | null {
  const { items, today, baseUrl } = input;
  if (items.length === 0) return null;
  const count = (urgency: DigestUrgency) => items.filter((i) => i.urgency === urgency).length;
  const parts = [
    count("overdue") > 0 ? `${count("overdue")} überfällig` : null,
    count("today") > 0 ? `${count("today")} heute fällig` : null,
    count("soon") > 0 ? `${count("soon")} diese Woche` : null,
  ].filter((p) => p !== null);
  const lines = [`Guten Morgen ${input.firstName},`, "", "das steht bei dir an:", ""];
  for (const urgency of ORDER) {
    const group = items
      .filter((i) => i.urgency === urgency)
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title, "de"));
    if (group.length === 0) continue;
    lines.push(`${HEADINGS[urgency]} (${group.length})`);
    for (const item of group) {
      const context = item.context ? ` · ${item.context}` : "";
      lines.push(
        `- ${KIND[item.kind]}: ${item.title}${context} (fällig ${germanDate(item.dueOn)})`,
        `  ${absolute(baseUrl, item.href)}`,
      );
    }
    lines.push("");
  }
  lines.push("Du bekommst diese Übersicht jeden Morgen, solange etwas offen ist.");
  return {
    subject: `marktwerk · ${germanDate(today)}: ${parts.join(", ")}`,
    text: lines.join("\n"),
  };
}

/** Immediate mail for an escalation or a critical overdue item. */
export function renderImmediate(input: {
  title: string;
  body?: string | null;
  link?: string | null;
  baseUrl: string;
}): RenderedMail {
  const lines = [input.title];
  if (input.body) lines.push("", input.body);
  if (input.link) lines.push("", absolute(input.baseUrl, input.link));
  return { subject: `marktwerk · ${input.title}`, text: lines.join("\n") };
}
