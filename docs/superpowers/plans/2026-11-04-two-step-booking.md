# Two-step booking (Reserviert → Fest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "Bestätigen" in the Standplan prototype into the company's two-step booking: Platzkarte → Reserviert (due date, automatic reminder and release) → Fest (marked paid by a person).

**Architecture:** Pure date and reference rules in `packages/core/src/bookings/lifecycle.ts`. The prototype keeps state in the existing browser store (`standplan/store.ts`). Each reservation carries a snapshot (vendor, mail address, event, stall number, amount), so the sweep can send its reminder and cancellation mails from any page without the server's demo data. Mails go into the Postfach conversation through `appendOutgoing`.

**Tech Stack:** TypeScript 6, Vitest, Next.js 16 client components, next-intl, the Biome linter.

Spec: `docs/superpowers/specs/2026-11-04-two-step-booking-design.md`.

## Global Constraints

- Vendor-facing text is German and uses "Sie". UI strings live in `messages/{de,en}/standplan.json` and `settings.json`.
- Due dates are `YYYY-MM-DD` strings in Europe/Berlin. Money is in integer cents.
- No real bank details in the repo; the demo uses placeholders.
- Prototype only: nothing is written to Postgres, and nothing is really sent.
- Run `pnpm check` before committing.

---

### Task 1: Core lifecycle rules

**Files:**
- Create: `packages/core/src/bookings/lifecycle.ts`
- Create: `packages/core/src/bookings/lifecycle.test.ts`
- Modify: `packages/core/src/bookings/index.ts` (export)

**Produces:**
- `DEFAULT_PAYMENT_RULES = { paymentDays: 4, reminderDaysBefore: 2 }`
- `paymentDueDate(reservedOn, marketDate, paymentDays): string`
  - `reservedOn` + N NRW working days.
  - If that date is on or after the market day, it is capped to the last working day before the market.
  - If that cap is earlier than `reservedOn`, the market day itself.
- `reminderDate(reservedOn, dueOn, daysBefore): string | null`
  - `dueOn` − R working days.
  - `null` unless that date is later than `reservedOn`.
- `paymentReference({ eventName, marketDate, stallNumber }): string`
  - Built from the initials of the event name's meaningful words (type words such as Flohmarkt are skipped), then `DDMM`, then the stall number without the dash.
  - Uses only A–Z, 0–9 and `-`, and is at most 20 characters.
  - Example: `RG-1211-B13`.
- `sweepReservations(list, today): { remind: string[]; release: string[] }`
  - Unpaid entries are released when `today > dueOn`.
  - Otherwise they get a reminder when `reminderOn` is set, `today >= reminderOn`, and no reminder has gone out yet.

**Tests:**
- weekend skip;
- NRW holiday (1 Nov 2027 is a Monday, All Saints);
- cap before the market;
- the cap before `reservedOn` → market day;
- reminder `null` when it falls too early;
- the reference example and umlaut folding;
- sweep: release beats remind, paid entries are ignored, already reminded entries are ignored.

### Task 2: Store

**Files:** modify `apps/web/src/components/standplan/store.ts`.

- `PlacementStatus = "proposed" | "reserved" | "fixed"`. Old stored `assigned` entries are read as `fixed`.
- `Reservation` holds: `reservedOn`, `dueOn`, `reminderOn`, `reference`, `amountCents`, `stallNumber`, `remindedOn?`, `paidOn?`, and a snapshot of `vendorName`, `email`, `conversationId`, `eventName` and `eventDate`. A `StoredPlacement` can carry an optional `reservation`.
- `released: ReleasedRecord[]`, where a record holds `itemId`, `eventId`, `stallNumber`, `reference`, `releasedOn` and `reason: "unpaid" | "manual"`.
- `bookingSettings` holds `paymentDays`, `reminderDaysBefore`, `payee`, `bank`, `iban` and `bic`, with placeholder defaults.
- `clockOffsetDays` (prototype) and `prototypeToday(state)`.

### Task 3: Mails and the sweep

**Files:**
- Create `standplan/booking-mails.ts`, which replaces `confirmation.ts` and provides `platzkarteMail`, `reminderMail` and `releaseMail`.
- Create `standplan/reservation-sweep.ts`, which provides `useReservationSweep()`. It runs `sweepReservations` on mount and whenever the prototype clock moves; reminders set `remindedOn`; releases remove the placement and add a `released` record; mails go through `appendOutgoing` and into `sent`.

### Task 4: Standplan UI

**Files:**
- Modify `standplan-view.tsx` and `plan-map.tsx`.
- Create `reservations-panel.tsx`.

What changes:
- **Sending:** "Platzkarte senden" turns drafts into Reserviert and no longer registers vendors.
- **Marking paid:** `markPaid(ids)` turns stalls Fest and registers vendors, with an undo.
- **Manual release:** `releaseManual(id)` releases a stall with an undo and sends no mail.
- **Moving a stall:** a moved reserved or Fest stall keeps its status and reservation, and the reservation's stall number is updated. A toast warns that the stall number changed.
- **Unplacing:** only drafts can be taken off the plan (button, Delete key, or dragging back to the list).
- **Map and legend colours:** Entwurf blue dashed, Reserviert amber, Fest green.
- **Placed list and detail card:** they show the status, due date and reference, plus "Als bezahlt markieren" and "Freigeben".
- **Open request card:** shows a "Reservierung verfallen am …" note.
- **View switch:** a "Plan | Reservierungen" switch at the top of the map column, kept in the URL as `?ansicht=reservierungen`.
- **Reservierungen panel:** a table with checkboxes for bulk "Als bezahlt markieren", a "bald fällig" filter, the Fest count, a Freigegeben list, and the prototype clock (+1 Tag, Heute).

### Task 5: Settings

**Files:**
- Create `app/(app)/einstellungen/buchungen/page.tsx` and `components/standplan/booking-settings.tsx`.
- Modify `settings-header.tsx` (tab `bookings`) and `messages/{de,en}/settings.json`.

The form has the payment deadline, the reminder timing and the bank fields, plus a live reference preview.

### Task 6: Postfach sweep, checks and browser check

- Call `useReservationSweep()` in `PostfachView`.
- Run `pnpm check`.
- In the browser: send a Platzkarte, fast-forward to the reminder, mark paid, fast-forward past the due date, and check the Postfach messages.
- Update research 12 (prototype table) and commit.
