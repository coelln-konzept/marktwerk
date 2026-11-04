# Manual bookings and Festplatzbuchung: design (prototype)

Date: 2026-11-04 · Branch: `exp/stand-allocation` · Status: approved by the product owner on 2026-11-04

Builds on: the two-step booking spec (2026-11-04), research 12, roadmap M9 ("phone entry screen").

## 1. Manual booking (phone or in person)

- The Standplan gets a **"+ Buchung"** button. It opens a form for the current event with these fields:
  - **Person:** search the vendor list (prefills the person) or enter a new one: name, company, phone, email (optional), private/commercial.
  - **Stall:** length, car (and its length), power, note.
  - **Source:** *Telefon* or *Vor Ort*.
- **Payment is chosen per booking** (decision 2026-11-04):
  - **Platzkarte per Mail**: the normal two-step booking (Reserviert → Fest). Only possible with an email address.
  - **Schon bezahlt (bar / vor Ort)**: once placed, "Als bezahlt eintragen" makes the stall **Fest** directly. No mail is sent, and the vendor joins the vendor list (if there is an email).
- The booking appears under **Offen** with a *Telefon* / *Vor Ort* badge and is placed like any request
  (drag, "Platzieren in …", or Autoplatz).
- "Platzkarten senden" for all drafts skips bookings marked as already paid and bookings without an email address.

## 2. Festplatzbuchung (one stall for a whole year)

- A placed stall (Reserviert or Fest, not a draft) can be turned into a Festplatz with "Als Festplatz {year} übernehmen". It
  covers **every date of that market in the year**, meaning events with the same name and venue in that
  calendar year (decision 2026-11-04).
- **On each date** the stall appears already placed, in its own colour ("Festplatz"). It counts as taken, cannot be dragged, and stays out of the reservation reminder and release.
  - If the spot is already taken on a date, the Festplatz is **not** placed there and the date is flagged as a **conflict**.
  - The date the Festplatz was created from keeps its own placement.
- **New "Festplätze" view** (next to Plan and Reservierungen): the market's Festplätze with vendor, stall, number of dates and conflicts.
- **Opting out of single dates** is an edge case. It sits inside each Festplatz under **"Termine verwalten"**: untick a date and the stall is free on that date. "Festplatz löschen" removes it altogether.
- **Payment:** open. The client is asked first (open question). Festplätze show as "Festplatz" and carry no amount.

## 3. Prototype data

- `BookingItem` gets `source` (`form` | `mail` | `phone` | `walkin`) and `paidUpfront`. Manual bookings are
  stored with the existing `manualItems` (`mailId: null`).
- The store gets `fixedSpots`. Each one holds a vendor snapshot, `seriesName`, `venueId`, `year`, `rowId`, `startCm`, `lengthCm`, `car`, `power`, `optedOut` (event ids), `sourceItemId` and `sourceEventId`.
- The Festplatz placements on each date are **derived** when the plan is shown, not copied into each date. Changing or deleting a Festplatz therefore takes effect everywhere at once.
- The server sends the first 400 vendors (read-only) for the lookup in the form.

Real build:
- `booking.source` and `booking.channel`;
- a `fixed_spot` table (vendor, preset/series, season, row, start, length, opt-outs) materialised as `booking_date` rows when dates are generated, through one service path;
- Festplatz payment once the client has decided.

## 4. Not in this round

- One phone booking for several dates.
- A printed Platzkarte for people without email.
- Festplatz payment and invoices.
- Moving a Festplatz (delete and create it again).
