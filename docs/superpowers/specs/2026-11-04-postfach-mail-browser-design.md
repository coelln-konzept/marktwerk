# Postfach as a light mail browser: design (prototype)

Date: 2026-11-04 · Branch: `exp/stand-allocation` · Status: approved in conversation, awaiting spec review

Builds on: research 12 (stall allocation prototype), research 03 §C (shared inbox), ADR 0008 (M365 via
Graph), ADR 0014 (no AI in operational flows), ADR 0019 (classic screens), roadmap M10/M11.

## 1. Goal and scope

Turn the prototype `/postfach` into a light mail browser for the company's shared mailboxes. Staff can:
- read conversations;
- reply, reply all, forward and write new mails with rich text, templates and signatures;
- work the inbox as a team (status, assignee, internal notes);
- run one-click workflow actions that connect a mail to Marktwerk (stall plan, contacts/vendors, permits,
  locations).

**Prototype level (decided):**
- Demo data from the server is the starting point. Every change lives in the browser (localStorage).
- Nothing is sent or received for real.
- Actions on contacts, vendors, permits and location documents are **simulated**: they show what would be
  created and log it, but write nothing to Postgres.
- The free-text stall request is the exception: it is really created in the browser's Standplan store,
  because both prototypes share that store.

**Out of scope this round:**
- real Graph or SMTP;
- tasks from mail;
- rules and filters;
- full-text search across stored bodies beyond the demo set;
- per-user personal mailboxes;
- AI drafting.

## 2. Decisions

| Topic | Decision |
|---|---|
| Realness | Clickable prototype, browser storage, demo data |
| Mailboxes | A few shared mailboxes: `buchung@`, `info@`, `genehmigungen@`, plus an "Alle" view |
| Team workflow | Status Offen / Wartet / Erledigt, assignee, internal notes |
| Signatures | One per mailbox, plus an optional event info block built from event data (replaces per-market Outlook signatures) |
| Actions | Stall request → Standplan; sender → Kontakt/Aussteller; attachment → Genehmigung/Ort. Not tasks |
| Action writes | Simulated only |
| Editor | Simple rich text |
| Approach | Grow `/postfach`; Tiptap editor (new dependency); templates & signatures under Einstellungen |

## 3. Screens

```
/postfach?postfach=buchung&ordner=offen&konv=c12
┌ Postfächer ─────┬ Konversationen ─────────────┬ Konversation ─────────────────────────┬ Aktionen ──────────┐
│ ▣ Alle      23  │ [Suche…]  [Mir zugewiesen]  │ Betreff                               │ ABSENDER           │
│ buchung@    14  │ ● Absender           09:12  │ Offen ▾ · Zuständig ▾ · Veranst. ▾    │ STANDANFRAGE       │
│ info@        6  │   Betreff…                  │ thread (incoming, outgoing, notes)    │ ANHÄNGE            │
│ genehm.@     3  │   ◉ Offen · Name · ⇄3       │ [Antworten][Allen][Weiterleiten][Notiz]│ VERKNÜPFT          │
│ ORDNER          │                             │ composer (Tiptap)                     │                    │
│ Offen/Wartet/   │                             │                                       │                    │
│ Erledigt/Gesen- │                             │                                       │                    │
│ det/Entwürfe/   │                             │                                       │                    │
│ Nicht erkannt   │                             │                                       │                    │
└─────────────────┴─────────────────────────────┴───────────────────────────────────────┴────────────────────┘
```

- **`/postfach`:** state in the URL: `postfach`, `ordner`, `konv`, `q`, `mir=1`.
- **`/postfach/neu`:** a new mail; the same composer, full width. `?an=` and `?veranstaltung=` prefill it.
- **`/einstellungen/mail`:** mail templates and mailbox signatures. It is called "Mailvorlagen", because "Vorlagen" already means the task templates at `/vorlagen`.
- **Folders are views, not storage:**
  - By status: Offen, Wartet, Erledigt (each conversation has exactly one).
  - Mail views: Gesendet (has an outgoing message), Entwürfe, Nicht erkannt (form mails that failed to
    parse).
  - Filter: "Mir zugewiesen".
- **List row:** unread dot, sender, time, subject, status badge (colour + icon + text), assignee, message
  count, 📎 when it has attachments.
- **Conversation header:** subject, then status menu, assignee menu and linked-event menu.
- **Thread:** messages in order. Older messages are collapsed except the last two. Notes are a yellow
  "Notiz (intern)" block.
- **Narrow screens:**
  - below ~1280 px the actions panel is a drawer opened from the header;
  - on a phone: list → conversation.
- **Keyboard:** `j`/`k` next/previous, `r` reply, `a` reply all, `f` forward, `n` note, `e` Erledigt,
  `Strg+Enter` send. Every action is also a button.

## 4. Data (prototype)

**Server demo loader** (`apps/web/src/server/standplan/demo-mail.ts`, extending today's loader):
- Builds conversations for the three mailboxes from dev data, deterministically.
- `buchung@`:
  - form requests (as today);
  - 4–6 free-text requests;
  - 3–4 threads that already contain our reply plus a vendor follow-up.
- `genehmigungen@`: 4–5 authority mails with PDF attachments. Some senders exist in Kontakte, some don't.
- `info@`: 4–5 supplier, invoice and general mails.
- **Attachments** are generated placeholders (name, size, mime). The PDF preview is a small generated
  document shown as an image.
- **Sender recognition:** the loader looks up the sender address **read-only** in `contact` and `vendor`
  and attaches `{ kind: "contact" | "vendor", id, label }`.

**Browser store** `apps/web/src/components/postfach/mail-store.ts`, separate from the Standplan store:
```ts
Conversation { id, mailboxId, subject, status: "offen" | "wartet" | "erledigt", assigneeId: string | null,
               eventId: string | null, unread: boolean, lastActivityAt: string }
Message      { id, conversationId, kind: "incoming" | "outgoing" | "note", from: Address, to: Address[],
               cc: Address[], html: string, text: string, attachments: Attachment[], at: string,
               authorId?: string, templateId?: string }
Draft        { id, conversationId: string | null, mailboxId, mode: "reply" | "replyAll" | "forward" | "new",
               to, cc, subject, html, attachments, includeSignature, includeEventBlock, updatedAt }
Template     { id, name, mailboxId: string | null, category: "buchung" | "genehmigung" | "allgemein",
               subject: string | null, html: string }
Signature    { mailboxId, html }
ActionEntry  { id, conversationId, kind, summary, payload, at, authorId }
KnownSender  { address, kind: "contact" | "vendor", label }   // added by simulated actions
```
- The store holds only **overrides and additions** on top of the server data: changed conversations, new
  messages, drafts, edited templates and signatures, actions, and known senders. "Demo zurücksetzen" clears
  it.
- Demo templates and signatures ship with the loader; edits are stored as overrides.
- Assignees are dev users and staff members from the database (read-only list), plus "nicht zugewiesen".
- **Standplan link:** confirmations from the Standplan are written as `outgoing` messages into the request's
  conversation, instead of the separate `sent` list. The old list is migrated once on load.

## 5. Pure rules (`packages/core/src/mail/`, Vitest)

- `threadKey(subject, address)`: strips `AW:`, `WG:`, `Re:`, `Fwd:` (repeated, any case) and whitespace. It
  is used to join an incoming demo mail to an existing conversation. The real build uses the Graph
  `conversationId`.
- `nextStatus(current, event)`:
  - `send` → `wartet`;
  - `sendAndClose` → `erledigt`;
  - `incoming` on `wartet` or `erledigt` → `offen`;
  - `incoming` on `offen` → `offen`;
  - `manual(x)` → `x`.
- `autoAssign(assigneeId, senderId)`: on send, keep the current assignee, else assign the sender.
- `fillVariables(html, values)`: replaces variable nodes. Returns `{ html, missing: string[] }`; unknown
  keys count as missing.
- `buildQuote(message, locale)`: "Am Mo, 04.11.2026 um 09:12 schrieb Petra Schmitz:" + a blockquote of the
  message. Notes are never quoted.
- `assembleOutgoing({ bodyHtml, signatureHtml?, eventBlockHtml?, quoteHtml? })`: the final html + text
  (plain-text fallback).
- `eventBlock(event)`: name, weekday date + KW, venue, setup and market times, price per metre.
- `extractSignatureFields(text)`: phone (`+49`/`0…`), company line and street + postcode/city by fixed
  patterns, for the contact dialog. Rule-based, no AI.

## 6. Composer

- **Tiptap** with StarterKit (paragraph, bold, italic, lists, history), Underline, Link, and a custom
  inline atom node `variable` (attr `key`).
- Pasted HTML is reduced to these nodes and marks.
- **Toolbar:** B, I, U, bullet list, numbered list, link, clear formatting, "Variable ▾", "Vorlage ▾",
  📎.
- **Header fields:**
  - **Von:** mailbox select, defaulting to the conversation's mailbox.
  - **An / Cc:** address chips that validate on blur.
  - **Betreff:** prefilled `AW:` / `WG:` for reply and forward.
- **Toggles:** "Signatur" (on) and "Veranstaltungsinfo anhängen" (on when a linked event exists).
- **Variables:**
  - Sender: Anrede, Vorname, Nachname, Firma.
  - Event: Veranstaltung, Datum, Ort, Aufbau, Marktzeit, PreisProMeter.
  - Stall: Stand, Standlänge.
  - Our side: MeinName, Postfach.
  - Chips with no value are red, and send stays disabled until they are fixed or removed.
- **Templates:**
  - The picker is filtered by mailbox, then grouped by category.
  - Inserting puts the body at the cursor, and the subject if the subject is empty or only "AW: …".
- **Drafts:** autosave 800 ms after the last change. "Entwurf gespeichert" indicator. Discarding a draft
  has an undo toast.
- **Send:** fill variables → assemble → a 5-second toast "Wird gesendet… Rückgängig" → filed as an
  outgoing message. Then the status rule and auto-assign apply.
- **"Senden & Erledigt"** is the secondary send.

**Demo templates** (in "Sie"):
1. Standbestätigung
2. Warteliste
3. Absage (ausgebucht)
4. Rückfrage Standlänge
5. Zahlungserinnerung
6. Unterlagen nachgereicht
7. Danke für den Bescheid
8. Allgemeine Antwort

## 7. Actions panel

Every block appears only when it applies. Every action is a dialog pre-filled from the mail, confirmed by
one click, and logged as an `ActionEntry` shown in the history and in the thread as a small grey line.

1. **Absender:**
   - **Known sender:** label + link to `/kontakte/<id>` or `/aussteller/<id>`.
   - **Unknown sender:**
     - "Als Kontakt speichern…" with kind, name, email and phone/company from `extractSignatureFields`.
     - "Als Aussteller anlegen…" with private/commercial, name and email.
     - Both are **simulated**: the dialog footer says "Prototyp: wird nicht in der Datenbank angelegt".
       Afterwards the sender is a `KnownSender` in this browser.
2. **Standanfrage:**
   - **Parsed form mail:** fields + per-date status + "Im Standplan öffnen" (as today).
   - **Other `buchung@` mail:** "Standanfrage erfassen…". The form has event (upcoming events with rows),
     dates of the same series, length, car, power, Stammplatz and note, with name and email from the
     sender. **Really created** in the Standplan store as an open request linked to this conversation.
3. **Anhänge:** per file: preview, download, and:
   - **"Als Genehmigung ablegen…":** event, then its permits (read-only), received date, valid until.
   - **"Am Ort ablegen…":** location, document type (Lageplan, Vertrag, Bescheid, Sonstiges).
   - Both are simulated. The file gets a tag "abgelegt: …".
4. **Verknüpft:** linked event (also settable in the header) and the action history.

## 8. Error handling

- **Missing variable values:** send blocked, red chips, and a hint naming each missing value and how to fix
  it ("Veranstaltung verknüpfen").
- **Empty or invalid recipient:** an inline field error.
- **localStorage quota:** an error toast, and the large attachment isn't kept. Text and drafts keep
  working.
- **Malformed form mails** stay in "Nicht erkannt", with the field-level errors from research 12.

## 9. Testing

- Vitest for every rule in §5, including subject prefixes in mixed case, a reopen from `erledigt`, missing
  vs unknown variables, a quote of HTML containing lists, and German phone formats.
- **Browser check:**
  - reply with a template and send, then undo;
  - status changes and the reopen on an incoming demo reply;
  - an internal note;
  - draft resume after reload;
  - each action dialog;
  - a free-text request appearing under "Offen" in the Standplan;
  - a Standplan confirmation appearing in its conversation;
  - narrow width and dark mode.
- `pnpm check` (lint, typecheck, tests, messages de/en in sync).

## 10. Build order

1. Core mail rules + tests; demo conversations across 3 mailboxes; `mail-store`.
2. Three-pane client: mailboxes and folders, list, thread, status, assignee, notes, keyboard.
3. Tiptap composer: reply, reply all, forward, new; drafts; attachments; send + undo.
4. Templates, signatures, event block; Einstellungen → Mail (Mailvorlagen & Signaturen).
5. Actions panel: sender, free-text stall request → Standplan, attachments → permit/location, history.
6. Standplan confirmations as outgoing messages; update research 12 and this spec's status.

## 11. Path to production (not built now)

- Tables: `mailbox`, `email_thread` (status, assignee, event), `email_message` (Graph id, internet message
  id), `thread_link`, `reply_template`, `mailbox_signature`, `thread_note`.
- Graph application permissions scoped by RBAC to the three mailboxes; webhooks + delta sync; send as the
  mailbox (ADR 0008).
- The simulated actions call the existing services (contacts, vendors, permits, documents) with an audit
  log.
- The Tiptap editor component and the core rules carry over unchanged.
