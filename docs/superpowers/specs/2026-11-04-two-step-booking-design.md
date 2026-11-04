# Two-step booking (Reserviert → Fest): design (prototype, slice 1)

Date: 2026-11-04 · Branch: `exp/stand-allocation` · Status: approved by the product owner on 2026-11-04

Builds on: research 12 (stall allocation prototype), the Postfach spec (2026-11-04), roadmap M9/M10.

## 1. How the company works today

1. A vendor sends a request through the website form.
2. A team member places the request in the stall plan and confirms it. That only **reserves** the stall:
   the vendor gets the *Platzkarte* mail with the amount, the bank details and what to write as the payment
   reference.
3. When the transfer arrives, a team member marks the stall as paid. From then on it is **fixed for good**.
   The vendor gets no further mail ("Nach Eingang Ihrer Überweisung erfolgt keine weitere Bestätigung mehr").
4. If no payment arrives within the deadline, the reservation lapses and the stall is free again.

This slice prepares the prototype for that workflow. The website form and the full Platzkarte content per
venue come later (§7).

## 2. Decisions (product owner, 2026-11-04)

| Question | Decision |
|---|---|
| Unpaid after the deadline | **Released automatically.** A reminder mail goes out before, and a cancellation mail when it is released |
| Deadline | **4 working days** after the Platzkarte is sent (Mon–Fri, NRW holidays skipped) |
| Reminder | **Configurable in settings**, default **2 working days before** release |
| Vendor list | New people join the vendor list **when the stall becomes Fest** (not when reserved) |
| Payment reference | A **short code** per Platzkarte, e.g. `RG-1211-B13` (assumed; the owner did not object) |
| Mail on Fest | **None**, as in today's Platzkarte text |
| ADR 0014 ("reminders and cancellations are sent by a person") | **Amended** for this case: reminder and release run automatically by fixed rules; marking Fest stays a person's action. Logged in ADR 0014, vision, CLAUDE.md and open-questions |

## 3. Lifecycle

```
Entwurf ──"Platzkarte senden"──▶ Reserviert ──"Als bezahlt markieren"──▶ Fest
(proposed)                       (dueOn)                                  (fixed)
                                    ├─ reminder mail on reminderOn (once)
                                    └─ today > dueOn, still unpaid ─▶ released + cancellation mail
```

- **Entwurf** (`proposed`): a draft placement; saved versions work as today.
- **Reserviert** (`reserved`): holds the slot like a confirmed stall did before. Stores `reservedAt`, `dueOn`,
  `reference`, `amountCents`, `remindedAt?`.
- **Fest** (`fixed`): set by a person, one stall or several at once. Stores `paidAt`. New vendors are
  registered (simulated) at this moment.
- **Released**: the placement is removed. The booking item goes back to the open requests list with a
  "Reservierung verfallen am …" note; a `released` record keeps the history.
- Existing bookings in the demo (from the old website or phone) start as **Fest**.
- **Due date:** `reservedAt` + N working days (setting, default 4). If that is on or after the market day,
  the due date is the last working day before the market. If even that has passed (a reservation made a day
  before the market), the due date is the market day itself, and a person decides.
- **Reminder date:** `dueOn` − R working days (setting, default 2). If it falls on or before the day the
  Platzkarte was sent, no reminder is sent.
- **Release:** on the first working day after `dueOn`. The real build runs a daily job (pg-boss). The prototype
  runs the sweep when Standplan or Postfach opens, plus a **"Datum vorspulen"** control (prototype only) to
  test reminder and release without waiting.
- **Moving a reserved stall:** it stays Reserviert with the same due date and reference. The stall number
  changes, so the vendor needs a new mail. In this slice the UI only warns ("Platznummer geändert, Mail folgt
  in einem späteren Schritt").
- **Undo:** "Fest" and manual release have an undo toast, as other actions do. Automatic release has no undo;
  a released item can be placed and reserved again.

## 4. Screens

- **Plan:** three colours in the legend and on the map: Entwurf (grey), Reserviert (amber, "fällig Mi 18.11."),
  Fest (green). Reservations due within the reminder window get a marker.
- **Standplan, new tab "Reservierungen"** (per event, URL state `?ansicht=reservierungen`): one row per
  reservation with stall number, vendor, amount, reference code, due date and reminder status ("erinnert am …").
  Check rows and click **"Als bezahlt markieren"** to make them Fest. A row action **"Freigeben"** releases one by
  hand. A filter "nur überfällig / bald fällig". A small "Freigegeben" list shows what lapsed.
- **Confirm button** is renamed to **"Platzkarte senden"** (one or all drafts). The confirm toast counts
  reservations, not confirmations.
- **Postfach:** the Platzkarte, the reminder and the cancellation mail land in the vendor's conversation as
  outgoing messages (as the confirmation does today). The conversation status follows the existing rules.
- **Settings → "Buchungen" tab** (`/einstellungen/buchungen`): payment deadline in working days, reminder in
  working days before release, payee, bank, IBAN, BIC, and a live preview of a reference code. Stored in the
  browser like the rest of the prototype. Demo values are **placeholders**; the real bank details are not put
  into the repo.

## 5. Mails (German, "Sie")

1. **Platzkarte** (replaces the current confirmation mail), modelled on today's mail:
   Veranstaltung, Termin, laufende Meter, Extras (Auto, Strom), Platznummer, Betrag; payment instructions with
   the **reference code** and the due date as a real date ("bis Mittwoch, 18.11.2026"); "Zu beachten" (stall
   claim only after payment, no further confirmation, bring the Platzkarte, cancellation terms); market info
   (setup times, address); Flohmarktverordnung excerpt; footer with contact and bank. Venue-specific lines that
   need real data (car stall ranges, unloading by range) stay generic in this slice.
2. **Zahlungserinnerung:** short; same amount, bank and reference; "Ihre Reservierung wird am … freigegeben".
3. **Reservierung storniert:** short; the stall was released because no payment arrived; a new request is
   welcome.

The texts live in code for now (`confirmation.ts` grows into `booking-mails.ts`); editable templates come later.

## 6. Code

- `packages/core/src/bookings/lifecycle.ts` (pure, tested):
  - `addWorkingDays(date, n, holidays)` / `subtractWorkingDays`, built on `isBusinessDay` and `publicHolidays`;
  - `paymentDueDate({ reservedOn, marketDate, days, holidays })`;
  - `reminderDate({ reservedOn, dueOn, daysBefore, holidays })` → date or `null`;
  - `paymentReference({ eventCode, marketDate, stallNumber })` → e.g. `RG-1211-B13` (uppercase, no spaces,
    ≤ 20 characters so it fits a SEPA reference);
  - `sweepReservations(reservations, today, holidays)` → `{ remind: id[], release: id[] }`.
- `apps/web/src/components/standplan/store.ts`: `PlacementStatus = "proposed" | "reserved" | "fixed"`; new fields
  on `StoredPlacement`; `released: ReleasedRecord[]`; `bookingSettings`; old `assigned` entries read as
  `reserved` (due date computed from now). Prototype clock offset for "Datum vorspulen".
- Event short code for references: derived from the event or venue name (e.g. "Riehler Gürtel" → `RG`),
  overridable later per preset.
- Views: plan colours and legend, Reservierungen tab, renamed confirm action, settings tab, Postfach messages.
- The vendor register call moves from "confirm" to "Als bezahlt markieren".

## 7. Not in this slice (next steps)

- Changes to the website booking form.
- Venue market info as data (car only on certain stall numbers and lengths, unloading times by stall range,
  address and map). The current Platzkarte gives the Riehler Gürtel rules, which also feed the parking
  question in research 12.
- "Platz geändert" mail after moving a reserved stall.
- Cancellation by the vendor and the fees (5 € up to 7 days before, full amount after).
- Platzkarte as a PDF / small-amount invoice, GiroCode QR.
- Matching bank CSV/CAMT files to references (M10 payment check session).
- Editable mail templates for these three mails.

## 8. Testing

- Core unit tests for working days across weekends and NRW holidays (e.g. around 1 November and Christmas),
  the cap before market day, the reminder `null` case, the reference format and the sweep.
- Browser check: send a Platzkarte, see Reserviert with the due date, fast-forward to the reminder (mail in
  Postfach), mark one paid (Fest, vendor added), fast-forward past the due date for another (released,
  cancellation mail, back in open requests).
