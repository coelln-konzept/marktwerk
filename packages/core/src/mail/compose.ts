import { isoWeek } from "../dates/calendar";

/**
 * Building outgoing mail: variables, quotes, event info block, plain-text fallback. Variables are stored
 * in the editor's HTML as `<span data-variable="Key">…</span>` (the Tiptap `variable` node).
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VAR = /<span[^>]*data-variable="([^"]+)"[^>]*>[^<]*<\/span>/g;

/** Keys used in the HTML, in order of first appearance. */
export function variablesIn(html: string): string[] {
  const keys: string[] = [];
  for (const m of html.matchAll(VAR)) {
    const key = m[1];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Fills every variable; empty or unknown ones stay in place and are listed in `missing`. */
export function fillVariables(
  html: string,
  values: Record<string, string | null | undefined>,
): { html: string; missing: string[] } {
  const missing: string[] = [];
  const out = html.replace(VAR, (whole, key: string) => {
    const v = values[key];
    if (v === undefined || v === null || v === "") {
      if (!missing.includes(key)) missing.push(key);
      return whole;
    }
    return escapeHtml(v);
  });
  return { html: out, missing };
}

const berlin = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...opts }).format(new Date(iso));

/** "Am Mo., 02.11.2026 um 09:12 schrieb Petra Schmitz:" + the quoted message. */
export function buildQuote(m: { fromName: string; at: string; html: string }): string {
  const day = berlin(m.at, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = berlin(m.at, { hour: "2-digit", minute: "2-digit" });
  return `<p>Am ${day} um ${time} schrieb ${escapeHtml(m.fromName)}:</p><blockquote>${m.html}</blockquote>`;
}

/** Event info block that replaces the hand-made per-market Outlook signatures. */
export function eventBlock(e: {
  name: string;
  startsOn: string;
  venueName: string;
  setup?: string;
  open?: string;
  close?: string;
  pricePerMCents?: number;
}): string {
  const day = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${e.startsOn}T12:00:00Z`));
  const lines = [
    `<strong>${escapeHtml(e.name)}</strong>`,
    `${day} (KW ${isoWeek(e.startsOn).week})`,
    escapeHtml(e.venueName),
    e.setup ? `Aufbau ab ${e.setup} Uhr` : null,
    e.open && e.close ? `Marktzeit ${e.open}–${e.close} Uhr` : null,
    e.pricePerMCents !== undefined
      ? `${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(e.pricePerMCents / 100)} pro Meter`
      : null,
  ].filter(Boolean);
  return `<p data-event-block="1">${lines.join("<br>")}</p>`;
}

/** Readable plain text from mail HTML (the text part of every outgoing mail). */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|blockquote|ul|ol|h\d)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Body, then event block, then "--" + signature, then the quote. */
export function assembleOutgoing(p: {
  bodyHtml: string;
  eventBlockHtml?: string | null;
  signatureHtml?: string | null;
  quoteHtml?: string | null;
}): { html: string; text: string } {
  const html = [
    p.bodyHtml,
    p.eventBlockHtml,
    p.signatureHtml ? `<p>--</p>${p.signatureHtml}` : null,
    p.quoteHtml,
  ]
    .filter(Boolean)
    .join("");
  return { html, text: htmlToText(html) };
}
