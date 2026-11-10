# Postfach Mail Browser (prototype) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the prototype `/postfach` into a light mail browser: shared mailboxes, team workflow (status,
assignee, notes), a Tiptap composer with templates, variables and signatures, and simulated workflow actions.
The spec is `docs/superpowers/specs/2026-11-04-postfach-mail-browser-design.md`.

**Architecture:**
- Pure rules live in `packages/core/src/mail/` (Vitest).
- A server loader builds deterministic demo conversations from the dev database (read-only).
- A client `mail-store` (localStorage, `useSyncExternalStore`) keeps overrides and additions on top of the
  server data.
- Client views under `apps/web/src/components/postfach/`, plus the pages `/postfach`, `/postfach/neu` and
  `/einstellungen/mail`.

**Tech Stack:** Next.js 16, React 19, next-intl, Tailwind 4, Base UI, Tiptap 3.32.0 (`@tiptap/react`,
`@tiptap/starter-kit`, `@tiptap/pm`; StarterKit v3 already includes Link and Underline), Vitest.

**Note on detail level:**
- Task 1 (pure rules) has complete test and implementation code.
- The UI tasks (2–7) list exact files, interfaces, behaviours and verification. Their components follow the
  existing prototype files (`components/standplan/*`).
- Each UI task is verified in the browser at `http://localhost:3002`.

## Global Constraints

- Prototype only: nothing is written to Postgres. Mail is never really sent or received.
- Contact, vendor, permit and location actions are **simulated** (dialog + log only).
- The free-text stall request **is** created in the Standplan browser store.
- No AI (ADR 0014). Recognition is by fixed rules only.
- Vendor-facing text uses "Sie". UI wording is neutral German, with "du" only where an address is needed.
- Status is always colour + icon + text. Every drag or shortcut has a button alternative. Prefer undo toasts
  over confirm dialogs.
- No inline UI strings: keys go into `apps/web/messages/{de,en}/postfach.json` (a new area, registered in
  `src/i18n/messages.ts` and `src/i18n/global.d.ts`).
- Dates and times in German formats, KW where useful. Money in cents.
- Exact dependency versions, at least 2 weeks old: `@tiptap/*` **3.32.0**.
- `pnpm check` must pass (Biome, typecheck, tests, messages in sync) before each commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/mail/thread.ts` | `threadKey`, `nextStatus`, `autoAssign` |
| `packages/core/src/mail/compose.ts` | `fillVariables`, `buildQuote`, `assembleOutgoing`, `eventBlock`, `htmlToText`, `escapeHtml` |
| `packages/core/src/mail/signature-fields.ts` | `extractSignatureFields` |
| `packages/core/src/mail/*.test.ts` | Vitest for the above |
| `apps/web/src/components/postfach/types.ts` | Shared shapes (Mailbox, Conversation, Message, Draft, Template, …) |
| `apps/web/src/server/postfach/demo-mail.ts` | Demo conversations, templates, signatures, sender lookup, assignees, permits |
| `apps/web/src/components/postfach/mail-store.ts` | Browser store + derived selectors |
| `apps/web/src/components/postfach/postfach-view.tsx` | Three/four-column shell, URL state, keyboard |
| `apps/web/src/components/postfach/conversation-list.tsx` | List pane |
| `apps/web/src/components/postfach/thread-view.tsx` | Header (status/assignee/event), messages, notes |
| `apps/web/src/components/postfach/composer.tsx` | Tiptap composer, variables, templates, send + undo |
| `apps/web/src/components/postfach/variable-node.ts` | Tiptap inline atom node `variable` |
| `apps/web/src/components/postfach/actions-panel.tsx` | Sender, stall request, attachments, linked event, history |
| `apps/web/src/components/postfach/mail-settings.tsx` | Templates & signatures editor |
| `apps/web/src/app/(app)/postfach/page.tsx`, `neu/page.tsx` | Pages |
| `apps/web/src/app/(app)/einstellungen/mail/page.tsx` | Settings page |
| Remove: `apps/web/src/components/standplan/postfach-view.tsx` | Replaced by the new view |

---

### Task 1: Core mail rules

**Files:**
- Create: `packages/core/src/mail/thread.ts`, `compose.ts`, `signature-fields.ts`, `index.ts`
- Test: `packages/core/src/mail/thread.test.ts`, `compose.test.ts`, `signature-fields.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./mail";`)

**Interfaces (produces):**
```ts
type ConversationStatus = "offen" | "wartet" | "erledigt";
type StatusEvent =
  | { kind: "send" }
  | { kind: "sendAndClose" }
  | { kind: "incoming" }
  | { kind: "manual"; status: ConversationStatus };
threadKey(subject: string, address: string): string
normalizeSubject(subject: string): string
nextStatus(current: ConversationStatus, event: StatusEvent): ConversationStatus
autoAssign(current: string | null, senderId: string): string
fillVariables(html: string, values: Record<string, string | null | undefined>): { html: string; missing: string[] }
buildQuote(m: { fromName: string; at: string; html: string }): string
assembleOutgoing(p: { bodyHtml: string; eventBlockHtml?: string | null; signatureHtml?: string | null; quoteHtml?: string | null }): { html: string; text: string }
eventBlock(e: { name: string; startsOn: string; venueName: string; setup?: string; open?: string; close?: string; pricePerMCents?: number }): string
htmlToText(html: string): string
escapeHtml(s: string): string
extractSignatureFields(text: string): { phone: string | null; company: string | null; street: string | null; postalCity: string | null }
```

Variables are written in HTML as `<span data-variable="Vorname"></span>`. This is the Tiptap node's HTML;
see Task 4.

- [ ] **Step 1: Write the failing tests** (`thread.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { autoAssign, nextStatus, normalizeSubject, threadKey } from "./thread";

describe("normalizeSubject / threadKey", () => {
  it("strips repeated reply/forward prefixes in any case", () => {
    expect(normalizeSubject("AW: WG: re: Fwd:  Standanfrage Neuss ")).toBe("standanfrage neuss");
  });
  it("joins replies to the same sender's conversation", () => {
    expect(threadKey("AW: Frage zu Standgebühr", "Petra@Example.com")).toBe(
      threadKey("Frage zu Standgebühr", "petra@example.com"),
    );
  });
});

describe("nextStatus", () => {
  it("send → wartet, sendAndClose → erledigt", () => {
    expect(nextStatus("offen", { kind: "send" })).toBe("wartet");
    expect(nextStatus("offen", { kind: "sendAndClose" })).toBe("erledigt");
  });
  it("an incoming reply reopens wartet and erledigt", () => {
    expect(nextStatus("wartet", { kind: "incoming" })).toBe("offen");
    expect(nextStatus("erledigt", { kind: "incoming" })).toBe("offen");
    expect(nextStatus("offen", { kind: "incoming" })).toBe("offen");
  });
  it("manual sets any status", () => {
    expect(nextStatus("offen", { kind: "manual", status: "erledigt" })).toBe("erledigt");
  });
});

describe("autoAssign", () => {
  it("keeps an existing assignee, else takes the sender", () => {
    expect(autoAssign("a", "b")).toBe("a");
    expect(autoAssign(null, "b")).toBe("b");
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @marktwerk/core exec vitest run src/mail`. Expected: FAIL (module not
  found).

- [ ] **Step 3: Implement** `thread.ts`

```ts
export type ConversationStatus = "offen" | "wartet" | "erledigt";
export type StatusEvent =
  | { kind: "send" }
  | { kind: "sendAndClose" }
  | { kind: "incoming" }
  | { kind: "manual"; status: ConversationStatus };

const PREFIX = /^\s*(?:(?:aw|wg|re|fwd?|antw)\s*:\s*)+/i;

/** Subject without reply/forward prefixes, lower-cased, single spaces. */
export function normalizeSubject(subject: string): string {
  return subject.replace(PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Prototype threading: same normalised subject + same external address. Graph's conversationId later. */
export function threadKey(subject: string, address: string): string {
  return `${normalizeSubject(subject)}|${address.trim().toLowerCase()}`;
}

export function nextStatus(current: ConversationStatus, event: StatusEvent): ConversationStatus {
  switch (event.kind) {
    case "send":
      return "wartet";
    case "sendAndClose":
      return "erledigt";
    case "incoming":
      return "offen";
    case "manual":
      return event.status;
  }
  return current;
}

/** Whoever answers an unassigned conversation takes it. */
export function autoAssign(current: string | null, senderId: string): string {
  return current ?? senderId;
}
```

- [ ] **Step 4: Write the failing tests** (`compose.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { assembleOutgoing, buildQuote, eventBlock, fillVariables, htmlToText } from "./compose";

describe("fillVariables", () => {
  it("replaces filled variables and escapes values", () => {
    const r = fillVariables('<p>Guten Tag <span data-variable="Vorname"></span>,</p>', {
      Vorname: "Petra <3",
    });
    expect(r).toEqual({ html: "<p>Guten Tag Petra &lt;3,</p>", missing: [] });
  });
  it("reports empty and unknown variables and keeps them", () => {
    const r = fillVariables(
      '<span data-variable="Stand"></span> <span data-variable="Gibtsnicht"></span>',
      { Stand: "" },
    );
    expect(r.missing).toEqual(["Stand", "Gibtsnicht"]);
  });
});

describe("buildQuote", () => {
  it("quotes with a German header", () => {
    const q = buildQuote({ fromName: "Petra Schmitz", at: "2026-11-02T08:12:00Z", html: "<p>Hallo</p>" });
    expect(q).toContain("Am Mo., 02.11.2026 um 09:12 schrieb Petra Schmitz:");
    expect(q).toContain("<blockquote><p>Hallo</p></blockquote>");
  });
});

describe("eventBlock / assembleOutgoing / htmlToText", () => {
  it("builds the event block from event data", () => {
    const b = eventBlock({
      name: "Flohmarkt Neuss",
      startsOn: "2027-04-11",
      venueName: "Neuss – Markt",
      setup: "07:00",
      open: "11:00",
      close: "18:00",
      pricePerMCents: 1500,
    });
    expect(htmlToText(b)).toContain("Flohmarkt Neuss");
    expect(htmlToText(b)).toContain("So., 11.04.2027 (KW 14)");
    expect(htmlToText(b)).toContain("15,00 € pro Meter");
  });
  it("puts body, event block, signature and quote in order", () => {
    const out = assembleOutgoing({
      bodyHtml: "<p>Text</p>",
      eventBlockHtml: "<p>EVENT</p>",
      signatureHtml: "<p>SIG</p>",
      quoteHtml: "<blockquote>Q</blockquote>",
    });
    expect(out.text.indexOf("Text")).toBeLessThan(out.text.indexOf("EVENT"));
    expect(out.text.indexOf("EVENT")).toBeLessThan(out.text.indexOf("SIG"));
    expect(out.text.indexOf("SIG")).toBeLessThan(out.text.indexOf("Q"));
  });
  it("turns lists and paragraphs into readable text", () => {
    expect(htmlToText("<p>A</p><ul><li>x</li><li>y</li></ul><p>B&amp;C</p>")).toBe("A\n\n• x\n• y\n\nB&C");
  });
});
```

- [ ] **Step 5: Implement** `compose.ts`

```ts
import { isoWeek } from "../dates/calendar";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const VAR = /<span[^>]*data-variable="([^"]+)"[^>]*>(?:[^<]*)<\/span>/g;

export function fillVariables(html: string, values: Record<string, string | null | undefined>) {
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

export function buildQuote(m: { fromName: string; at: string; html: string }): string {
  const day = berlin(m.at, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = berlin(m.at, { hour: "2-digit", minute: "2-digit" });
  return `<p>Am ${day} um ${time} schrieb ${escapeHtml(m.fromName)}:</p><blockquote>${m.html}</blockquote>`;
}

export function eventBlock(e: {
  name: string;
  startsOn: string;
  venueName: string;
  setup?: string;
  open?: string;
  close?: string;
  pricePerMCents?: number;
}): string {
  const d = new Date(`${e.startsOn}T12:00:00Z`);
  const day = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  const lines = [
    `<strong>${escapeHtml(e.name)}</strong>`,
    `${day} (KW ${isoWeek(e.startsOn)})`,
    escapeHtml(e.venueName),
    e.setup ? `Aufbau ab ${e.setup} Uhr` : null,
    e.open && e.close ? `Marktzeit ${e.open}–${e.close} Uhr` : null,
    e.pricePerMCents !== undefined
      ? `${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(e.pricePerMCents / 100)} pro Meter`
      : null,
  ].filter(Boolean);
  return `<p data-event-block="1">${lines.join("<br>")}</p>`;
}

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
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assembleOutgoing(p: {
  bodyHtml: string;
  eventBlockHtml?: string | null;
  signatureHtml?: string | null;
  quoteHtml?: string | null;
}) {
  const parts = [p.bodyHtml, p.eventBlockHtml, p.signatureHtml ? `<p>--</p>${p.signatureHtml}` : null, p.quoteHtml];
  const html = parts.filter(Boolean).join("");
  return { html, text: htmlToText(html) };
}
```

Check `isoWeek` exists in `packages/core/src/dates/calendar.ts` (it is used by `apps/web/src/lib/format.ts`).
If it is exported from another core file, import it from there.

- [ ] **Step 6: Write the failing tests** (`signature-fields.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { extractSignatureFields } from "./signature-fields";

describe("extractSignatureFields", () => {
  it("finds phone, company and address in a German signature", () => {
    const f = extractSignatureFields(
      "Mit freundlichen Grüßen\nAnna Berg\nStadt Köln – Ordnungsamt\nWilly-Brandt-Platz 3\n50679 Köln\nTel. 0221 221-12345",
    );
    expect(f).toEqual({
      phone: "0221 221-12345",
      company: "Stadt Köln – Ordnungsamt",
      street: "Willy-Brandt-Platz 3",
      postalCity: "50679 Köln",
    });
  });
  it("reads +49 numbers and returns nulls when nothing matches", () => {
    expect(extractSignatureFields("Gruß\nLars\nMobil: +49 171 2345678").phone).toBe("+49 171 2345678");
    expect(extractSignatureFields("Hallo")).toEqual({ phone: null, company: null, street: null, postalCity: null });
  });
});
```

- [ ] **Step 7: Implement** `signature-fields.ts`

```ts
const PHONE = /(?:tel\.?|telefon|mobil|fon)?[:\s]*((?:\+49|0)[\d\s/()-]{6,}\d)/i;
const POSTAL = /^\s*(\d{5}\s+[A-ZÄÖÜ][\wäöüß .-]+)\s*$/m;
const STREET = /^\s*([A-ZÄÖÜ][\wäöüß.-]+(?:[ -][\wäöüß.-]+)*\s+\d+[a-z]?)\s*$/m;
const COMPANY = /^\s*(.*\b(?:GmbH|AG|e\.\s?V\.|UG|KG|Stadt|Amt|Ordnungsamt|Gemeinde)\b.*)$/m;

/** Fixed patterns over the mail's last lines; a person checks the result in the dialog (ADR 0014). */
export function extractSignatureFields(text: string) {
  const tail = text.split("\n").slice(-12).join("\n");
  return {
    phone: PHONE.exec(tail)?.[1]?.trim() ?? null,
    company: COMPANY.exec(tail)?.[1]?.trim() ?? null,
    street: STREET.exec(tail)?.[1]?.trim() ?? null,
    postalCity: POSTAL.exec(tail)?.[1]?.trim() ?? null,
  };
}
```

- [ ] **Step 8: Run** `pnpm --filter @marktwerk/core exec vitest run src/mail`. Expected: all pass. Then run
  `pnpm --filter @marktwerk/core test` (the full suite stays green).
- [ ] **Step 9: Commit** `feat(core/mail): threading, status, variables, quotes, signature fields`.

### Task 2: Types, demo data and store

**Files:**
- Create: `apps/web/src/components/postfach/types.ts`
- Create: `apps/web/src/server/postfach/demo-mail.ts`
- Create: `apps/web/src/components/postfach/mail-store.ts`
- Modify: `apps/web/src/server/standplan/demo-data.ts` (export `deDate`, the form-mail builder and
  `OTHER_MAILS` for reuse, or move them)

**Interfaces (produces):**
```ts
// types.ts
type MailboxId = "buchung" | "info" | "genehmigungen";
interface Mailbox { id: MailboxId; address: string; label: string }
interface Address { name: string; address: string }
interface Attachment { id: string; name: string; size: number; mime: string; dataUrl?: string }
interface Message { id: string; conversationId: string; kind: "incoming" | "outgoing" | "note";
  from: Address; to: Address[]; cc: Address[]; html: string; text: string; attachments: Attachment[];
  at: string; authorId?: string; parse?: InboxMail["parse"] }
interface Conversation { id: string; mailboxId: MailboxId; subject: string; external: Address;
  status: ConversationStatus; assigneeId: string | null; eventId: string | null; unread: boolean;
  lastActivityAt: string }
interface Draft { id: string; conversationId: string | null; mailboxId: MailboxId;
  mode: "reply" | "replyAll" | "forward" | "new"; to: Address[]; cc: Address[]; subject: string;
  html: string; attachments: Attachment[]; includeSignature: boolean; includeEventBlock: boolean;
  quoteOf: string | null; updatedAt: string }
interface MailTemplate { id: string; name: string; mailboxId: MailboxId | null;
  category: "buchung" | "genehmigung" | "allgemein"; subject: string | null; html: string }
interface Signature { mailboxId: MailboxId; html: string }
interface ActionEntry { id: string; conversationId: string; kind: "contact" | "vendor" | "stallRequest"
  | "permit" | "venueDocument" | "linkEvent"; summary: string; at: string; authorId: string }
interface KnownSender { address: string; kind: "contact" | "vendor"; label: string; id?: string }
interface Person { id: string; name: string }
interface PermitOption { id: string; venueId: string; title: string; status: string; season: number | null }
interface MailDemo { mailboxes: Mailbox[]; conversations: Conversation[]; messages: Message[];
  templates: MailTemplate[]; signatures: Signature[]; knownSenders: KnownSender[]; people: Person[];
  me: Person; permits: PermitOption[]; venues: { id: string; name: string }[] }
```
- `loadMailDemo(actor, today): Promise<{ mail: MailDemo; plan: StandplanData }>`. It reuses
  `loadStandplanDemo`. Form-mail messages keep their `parse` result. Conversation id = `c-<mailId>`.
- Store API: `useMailStore()` → `{ state, update, reset }`.
- Selectors: `mergeConversations(demo, state)`, `messagesOf(demo, state, conversationId)`.
- Mutations:
  - `setStatus(id, status)`, `setAssignee(id, personId|null)`, `setEvent(id, eventId|null)`, `markRead(id, unread)`
  - `addNote(convId, html, me)`
  - `saveDraft(draft)`, `deleteDraft(id)`
  - `sendDraft(draft, filled: { html; text }, me, close: boolean)`
  - `upsertTemplate(t)`, `deleteTemplate(id)`, `setSignature(mailboxId, html)`
  - `logAction(entry)`, `addKnownSender(s)`
  - `simulateIncoming(convId)`: the demo button "Antwort simulieren" that shows a reopen.
- localStorage key `marktwerk.postfach-prototype.v1`.
- The state keeps only overrides and additions:
  `{ conv: Record<id, Partial<Conversation>>, messages: Message[], drafts: Draft[], templates: Record<id, MailTemplate | null>, signatures: Partial<Record<MailboxId,string>>, actions: ActionEntry[], knownSenders: KnownSender[] }`.

Demo content (deterministic seed):
- **`buchung@`:**
  - every form mail from today's loader;
  - 5 free-text requests from real vendors (e.g. "habt ihr am 11.04. in Neuss noch 4 m frei? Ich komme mit Bulli");
  - 3 of those with our earlier reply (outgoing, template text) and the vendor's follow-up, so they show
    status Offen and three messages.
- **`genehmigungen@`:**
  - 3 mails from known authority contacts (the email matches `contact.email`), each with a PDF attachment
    (`Bescheid_Sondernutzung_<Ort>.pdf`, `Verkehrsrechtliche_Anordnung_<Ort>.pdf`);
  - 1 from an unknown sender with a signature block (company, street, postcode, phone).
- **`info@`:** the 4 `OTHER_MAILS` plus 1 supplier mail with a quote PDF.
- **Attachments:** the `dataUrl` is a tiny generated PDF (a fixed minimal PDF string with the file name as
  text, base64) so "öffnen" works.
- **Statuses:** form mails `offen`; 2 conversations `wartet`; 2 `erledigt`. Assignees are random among
  `people`.
- **`people`:** `staff_member` (displayName) where `active`, plus the current user (`me`, from
  `getCurrentUser()`).
- **Templates** (8, "Sie", using variable spans) and **signatures** (3, one per mailbox), as in spec §6.

Steps:
- [ ] Write `types.ts`, `demo-mail.ts` and `mail-store.ts`.
- [ ] Typecheck: `cd apps/web && npx tsc --noEmit`.
- [ ] Commit `feat(postfach): demo conversations and mail store`.

### Task 3: Client shell, list and thread (no composer yet)

**Files:**
- Create: `postfach-view.tsx`, `conversation-list.tsx`, `thread-view.tsx`
- Create: `apps/web/messages/{de,en}/postfach.json`, registered in `messages.ts` and `global.d.ts`
- Move the `postfach` namespace out of `standplan.json` into `postfach.json`
- Modify: `apps/web/src/app/(app)/postfach/page.tsx`
- Delete: `apps/web/src/components/standplan/postfach-view.tsx`

**Behaviour:**
- Columns `220px | minmax(300px,380px) | 1fr | 320px`. Below `xl` the actions panel is hidden behind an
  "Aktionen" button (it becomes a drawer in Task 6).
- Left column:
  - mailboxes: Alle + 3, with open counts;
  - folders: Offen, Wartet, Erledigt, Gesendet, Entwürfe, Nicht erkannt;
  - a "Mir zugewiesen" toggle;
  - the demo note and "Demo zurücksetzen".
- **URL:** `router.replace` with `postfach`, `ordner`, `konv`, `q`, `mir`.
- **List:** search over subject, external name/address and text. Sorted by `lastActivityAt` desc. Each row
  has the unread dot, `StatusBadge` (offen = info/CircleDot, wartet = waiting/Clock, erledigt = ok/Check),
  assignee initials, message count and 📎.
- **Thread header:**
  - subject;
  - status menu (NativeSelect is fine);
  - assignee menu;
  - event menu (upcoming events, plus "keine");
  - "Als ungelesen markieren";
  - "Antwort simulieren" (prototype only, labelled as such).
- **Thread body:**
  - messages, with all but the last two collapsed into "n ältere Nachrichten";
  - incoming in a card, outgoing tinted `bg-accent-soft`, notes `bg-status-warn-bg` labelled "Notiz (intern)";
  - attachments as chips.
- **Message HTML:** rendered with `dangerouslySetInnerHTML`, **after a whitelist sanitizer**
  (`sanitizeMailHtml` in `components/postfach/sanitize.ts`: it keeps p, br, strong, b, em, i, u, ul, ol, li,
  a[href http(s)/mailto], blockquote, span[data-variable], and drops everything else and all attributes
  except those).
- **Form mails:** keep the "erkannt" side-by-side view from the old Postfach inside the thread (the original
  `<pre>` + fields). Reuse its markup in a `FormRequestCard` within `thread-view.tsx`.
- **Keyboard** on the view container: `j`/`k`/`e`. `r`/`a`/`f`/`n` are wired in Task 4.
- Status, assignee and event changes show an undo toast.

Steps:
- [ ] Implement.
- [ ] `pnpm --filter @marktwerk/web test` (messages in sync) and `npx tsc --noEmit`.
- [ ] Browser:
  - switch mailbox and folder (the URL updates);
  - open a conversation (unread clears);
  - change the status (it moves folder) and undo;
  - assign;
  - "Antwort simulieren" on a Wartet conversation turns it into Offen.
- [ ] Commit `feat(postfach): three-pane mail client with status, assignee, notes view`.

### Task 4: Tiptap composer

**Files:**
- Modify: `apps/web/package.json` (add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, all
  `3.32.0`), then `pnpm install`
- Create: `variable-node.ts`, `composer.tsx`
- Create: `apps/web/src/app/(app)/postfach/neu/page.tsx`

**Behaviour:**
- **`VariableNode`:** `Node.create({ name: "variable", group: "inline", inline: true, atom: true })`.
  - Attr `key`.
  - `parseHTML: span[data-variable]`.
  - `renderHTML: ["span", { "data-variable": key, class: "mail-var" }]`.
  - A React node view shows a chip `[Key]`, red (`bg-status-critical-bg`) when `values[key]` is empty.
  - The values come via editor `storage`.
- **Editor:** `StarterKit.configure({ heading: false, code: false, codeBlock: false, horizontalRule: false, link: { openOnClick: false, autolink: true } })`.
- **`transformPastedHTML`:** run `sanitizeMailHtml`.
- **Toolbar:**
  - B, I, U, bullet list, numbered list, link (prompt for the URL), clear;
  - Variable ▾ (grouped: Absender, Veranstaltung, Stand, Wir);
  - Vorlage ▾ (filtered by mailbox, grouped by category);
  - 📎 (file input → dataURL; above 1.5 MB show an error toast and skip the file).
- **Header:** Von (mailbox select), An / Cc as chips with email validation, Betreff.
- **Toggles:** "Signatur", "Veranstaltungsinfo anhängen" (disabled without a linked event).
- **Modes:**
  - reply: to = external;
  - replyAll: also adds the cc of the last incoming;
  - forward: to empty, attachments copied;
  - new.
- **Subject:** reply `AW: <subject>`, forward `WG: <subject>`. Never double the prefix (use
  `normalizeSubject`).
- **Quote:** `buildQuote(last non-note message)`, shown collapsed under "Zitat anzeigen".
- **Values:**
  - Anrede: `Frau`/`Herr` is not known, so leave it empty unless the vendor record has it; the prototype
    leaves it empty.
  - Vorname/Nachname: split the external name.
  - Firma: the vendor company if known.
  - Event variables: from the linked event.
  - Stand/Standlänge: from the Standplan store placement of the conversation's request.
  - MeinName = `me.name`; Postfach = mailbox address.
- **Send:**
  - blocked while `missing.length > 0`; the hint lists them;
  - then `assembleOutgoing` and `sendDraft` with a 5 s delay (`setTimeout`);
  - a toast "Wird gesendet …" with "Rückgängig" restores the draft.
- **"Senden & Erledigt"** uses `close: true`.
- **Drafts:** autosave debounced 800 ms. `Strg+Enter` sends. Esc asks nothing: it keeps the draft and
  closes the composer.
- **Thread view:** the buttons Antworten / Allen antworten / Weiterleiten / Notiz open the composer inline
  under the thread. Notiz uses the same editor in note mode (no header, button "Notiz speichern").
- **`/postfach/neu`:** a full-width composer. `?an=` and `?veranstaltung=` prefill it; it redirects to the
  new conversation after sending.

Steps:
- [ ] Install, implement.
- [ ] Typecheck and lint.
- [ ] Browser:
  - reply with a template; the red chip blocks send until an event is linked;
  - send → undo → send;
  - the status becomes Wartet and the conversation shows under Gesendet;
  - add a note;
  - reload and the draft resumes;
  - forward copies attachments;
  - new mail.
- [ ] Commit `feat(postfach): Tiptap composer with variables, templates, drafts and send undo`.

### Task 5: Templates & signatures settings

**Files:**
- Create: `mail-settings.tsx`
- Create: `apps/web/src/app/(app)/einstellungen/mail/page.tsx`
- Modify: the Einstellungen index page (add a link card "Mail: Vorlagen & Signaturen")

**Behaviour:**
- **Templates:** a list on the left, an editor on the right: name, mailbox (alle/…), category, subject, and
  the body using the same Tiptap editor (toolbar without Vorlage).
- New, duplicate and delete, with undo.
- Signatures: one editor per mailbox.
- A preview with sample values.

Steps:
- [ ] Implement.
- [ ] Browser: edit a template, then use it in the composer.
- [ ] Commit.

### Task 6: Actions panel

**Files:**
- Create: `actions-panel.tsx`
- Modify: `thread-view.tsx`/`postfach-view.tsx` (mount it, drawer below xl)
- Modify: `components/standplan/store.ts` and `standplan-view.tsx`: support **manual requests**:
  `StandplanState.manualItems: BookingItem[]`, merged with `data.items` in the Standplan
  (`mailId = conversation id`).

**Behaviour:**
1. **Absender:**
   - **Known:** label + link (`/kontakte/<id>`; for vendors `/aussteller?q=<email>`).
   - **Unknown:** two buttons opening Modal dialogs, pre-filled using `extractSignatureFields(last incoming
     text)`:
     - contact: Art, Name, Ansprechperson, E-Mail, Telefon, Straße, PLZ/Ort;
     - vendor: privat/gewerblich, Name, E-Mail.
   - "Anlegen (Simulation)" → `addKnownSender` + `logAction`.
   - The dialog footer reads "Prototyp: wird nicht in der Datenbank angelegt."
2. **Standanfrage:**
   - **Parsed form mail:** status per date + link (from the plan data + Standplan store).
   - **Other `buchung@` conversations:** "Standanfrage erfassen…" with event (upcoming with rows), length
     (m), Auto (+ length), Strom, Stammplatz text, Anmerkung (prefilled with the mail text, first 300
     chars), name and email from the sender.
   - Saving pushes a `BookingItem` into `manualItems` (`requestRef: "MAIL-<n>"`), logs the action, links
     the conversation to the event and offers "Im Standplan öffnen".
3. **Anhänge:** per attachment: open (dataUrl in a new tab), and:
   - **"Als Genehmigung ablegen…":** event, then the permits of that event's venue, received date and
     valid-until date.
   - **"Am Ort ablegen…":** location, then type.
   - Both are simulated. They log, tag the attachment ("abgelegt: …") and show a toast.
4. **Verknüpft:** the event select (same state as the header) and the history list (`actions` for this
   conversation, newest first).

Steps:
- [ ] Implement.
- [ ] Browser:
  - each dialog;
  - a free-text request shows under Offen in `/standplan?veranstaltung=…`;
  - history entries;
  - drawer at a narrow width.
- [ ] Commit `feat(postfach): actions panel (sender, stall request, attachments, history)`.

### Task 7: Standplan confirmations into conversations, docs

**Files:**
- Modify: `standplan-view.tsx` `confirm()`: besides the store's `sent`, write an outgoing message via
  mail-store `appendOutgoing(conversationId, …)`. The conversation id is `c-<mailId>` for form mails and
  `mailId` for manual items. Status → wartet.
- Modify: `apps/web/src/components/postfach/mail-store.ts` (add `appendOutgoing`)
- Modify: `docs/research/12-...md` (prototype table + limits), and the spec status → "built (prototype)"

Steps:
- [ ] Implement.
- [ ] Browser: confirm in the Standplan → the conversation shows our confirmation and is in Wartet.
- [ ] `pnpm check`.
- [ ] Commit, then push (the user already asked for pushes on this branch).

## Self-review

- **Spec coverage:**
  - §3 screens → Tasks 3, 4, 5;
  - §4 data → Task 2;
  - §5 rules → Task 1;
  - §6 composer → Task 4;
  - §7 actions → Task 6;
  - §8 errors → Tasks 4 and 6;
  - §9 tests → Task 1 + browser checks;
  - §10 order → Tasks 1–7;
  - Standplan link → Task 7.
- **Placeholders:** none. The UI tasks state their behaviour and verification instead of full code (see the
  note at the top).
- **Names:** `ConversationStatus`, `nextStatus` and `fillVariables` are used consistently. The mailbox ids
  are `buchung | info | genehmigungen` everywhere.
