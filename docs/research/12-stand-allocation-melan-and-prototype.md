# Research 12 — Stall allocation: competitor teardown (melan.de) and the Postfach/Standplan prototype

Date: 2026-11-04 · Branch: `exp/stand-allocation` (experimental, not for `main` yet)

**Goal.** Understand how a competitor's online stall booking works (map selector, price calculator, plan
overlay, spot choice). Then check whether marktwerk can realistically have the **internal** version:
booking mails land in a Postfach, a fixed-rule parser recognises the website-form requests, and staff drag
them onto a stall plan per event. On confirmation the vendor gets a mail, and the plan can be printed.

Sources: public pages, PDFs and the public JS bundle of www.melan.de, fetched read-only on 2026-11-04. No
login, no form submitted, nothing booked. Tags: **[O]** observed, **[I]** inferred.

---

## 1. melan.de in short

- **Company:** "Melan macht Märkte Veranstaltungs GmbH", based in Baesweiler. **[O]**
- **Scale:**
  - They claim about 1,500 markets per year. **[O]**
  - 76 locations; 31 of them are bookable online. **[O]**
- **Booking channels:** **[O]**
  - Online, paid with PayPal.
  - Phone, email or fax, paid by SEPA direct debit.
  - In person, at the office or at the mobile market trailer (cash or EC card).
  - **All three channels feed the same stall plan.** **[I]**
- **Tech:** **[O]**
  - Their own PHP CMS ("admon", by the agency Bauer + Kirch), with jQuery and Parsley.
  - No booking SaaS and no map library. Google Maps is used only for the location search.

### 1.1 Booking flow (3-step wizard, login required)

1. **Market & date ("Markt & Termin").** **[O]**
   - A market dropdown grouped by region. Fee table and description are pre-rendered for every market.
   - One or more dates can be ticked as checkboxes.
2. **Stall & goods ("Standplatz & Waren"), a vertical stepper.** **[O, from JS]**
   1. **Goods:** metres per goods type (e.g. private second-hand vs new goods). The total must reach
      `minimumMeters`. A rented booth is optional and unlocks from `boothRequiredMeters` upward.
   2. **Row:** rows shorter than the chosen metres are disabled.
   3. **Start metre:** the vendor clicks one start square. The span = start + metres − 1, previewed on
      hover.
   4. **Price:** the server computes it via AJAX on every change and returns the total plus a ready-made
      HTML price table.
3. **Review & order ("Prüfen & Bestellen").** **[O, from CSS/JS]**
   - Billing address, coupon code, PayPal Plus.
   - A **reservation countdown**: the stalls are held while the vendor checks out.

### 1.2 The map

Item by item, how the map works and what we take from it:

- **Rendering.** **[O]** A faded site-plan image (opacity 0.3) with absolutely positioned `<div>` squares on
  top. **For us:** we use an SVG true to scale instead, because their squares are all the same size.
- **Geometry.** **[O]** Each row is a set of straight *paths* (start x/y and end x/y in image pixels). The N
  one-metre squares are spaced evenly along a path; curves are polylines. **For us:** we keep the idea of a row
  that can be rotated and moved over a background image.
- **Unit.** **[O]** One square is one running metre. A booking = row + start index + metres. **For us:** our
  model is the same, just in cm: `row_id` + `[start_cm, end_cm)`.
- **States.** **[O]** 0 free (green), 1 restricted (yellow, bookable after a warning note), 2 taken (red),
  selected (blue). **For us:** we add later "blocked zones with a note" (hydrant, tree, cart corral).
- **Visibility.** **[O]** Only the selected row is drawn. **For us:** we show the whole venue, so free space is
  visible at a glance.
- **Zoom.** **[O]** A fixed 2.5× toggle on click, and no pan. **For us:** we have wheel zoom, pan and "show the
  whole plan".
- **Availability.** **[O]** Loaded once per page as `stands_status[row][index]`, with no live update.
  **For us:** we use server-side optimistic checks and conflict errors.
- **Occupancy rules.** **[O]** Per market:
  - A stall either touches its neighbour or leaves ≥ 2 m.
  - It is flush with the row edge or ≥ 3 m (variant: 2 m) from it.
  - This prevents unsellable 1 m leftovers.

  **For us:** adopted as an optional `GapRule` in `packages/core`, on by default in the prototype.

### 1.3 Pricing [O]

- **Rate:** per running metre, whole metres, measured on the longest side. The rate depends on market,
  goods type and private vs commercial.
- **Example (Aachen):**
  - Private second-hand €13.50/m and new goods €30/m.
  - Base fee €6 / €11 per stall.
  - Surcharges:
    - per metre: roof +€5, main row +€5, "super main row" +€10;
    - flat: corner +€30, charged for corner spots whether or not the corner is used.
- **Volume tiers:** e.g. €24 → €22/m from 5 m. Negative surcharges exist too (a cheaper row: −€1.67/m).
- **Extras:**
  - Electricity €10 flat.
  - Cleaning deposit €10, refunded on the day if the spot is left clean.
  - Booth rental €15.
- **Car:** a car needs ≥ 4 m of stall, a van 5–6 m. If the car is longer than the booking, the extra metres
  are charged.
- **Discounts:** annual booking −10% (needs a "Blocker", i.e. a regular spot held until 2 weeks before).
  Promotions with flat prices exist.
- **VAT:** not shown. Prices are probably gross. **[I]**

### 1.4 Terms that affect allocation [O]

- **No right to a specific spot, even though the vendor picks it online.** Staff make the binding assignment
  on site.
- **No-shows:** after 09:00 the spot can be given away, and the fee is kept.
- **Cancellation:** until the Wednesday before. The money is **credited to the customer account**, never paid
  back.
- **The confirmation (Auftragsbestätigung)** carries:
  - row, metre from–to;
  - market number (market + year + calendar week);
  - arrival times.

  The vendor brings it to the market.
- **On site:** stalls are chalked the day before, with row numbers "R…" and metre markers.

### 1.5 Their weaknesses (our chance)

- Only one row is visible and there is no overview. Zoom is crude, and nothing works by keyboard.
- All squares are the same size; there are no real depths or widths.
- Availability is loaded once, so two vendors can race for the same stall until checkout.
- Booking needs an account, and there is no guest flow.
- It is unclear how one stall works across several selected dates.

---

## 2. How this maps to marktwerk (already planned)

Most of the foundation exists in our docs; melan confirms the model:

- **Space model** (`research/02`, `data-model.md` "Phase 2 sketch"): Venue → Zone → **Row** (`row.length_cm`,
  `depth_cm`, `car_allowed`, `car_slots`, `power`). A placement is a **metre interval on a row**. The map
  draws rows; it doesn't change the model. These tables **exist today** with dev data: 12 venues, 4–18 rows
  each.
- **Booking records** (planned): `booking_request` (source, `message_id`/`legacy_ref` idempotency, raw
  payload) → `booking_date` per event (length, car, `row_id`, `start_cm`, `end_cm`, placement status
  `unplaced → proposed → held → assigned`).
- **Mail:**
  - ADR 0008: Graph, shared booking mailbox.
  - ADR 0013 fallback: Graph subscription plus **fixed-rule parser**.
  - ADR 0014: **no AI** in Phases 1–3.
  - Roadmap: M8 (legacy bridge), M9 (allocation, "drag request onto slot", Autoplatz), M10 (confirmation +
    Platzkarte PDF), M11 (M365 inbox), M14 (stall maps with background, layers, print, Lageplan for
    authorities).
- **Decided:** vendor-facing documents use "Sie". "No email for now": the `settings.emailEnabled` master
  switch stays off.

What we take from melan:
- the gap rule;
- row + start + length as the booking unit;
- live price from one server-side source;
- a timed hold for the later public form;
- blocked/restricted zones with notes;
- surcharges per row/position (corner, main row, roof).

What we do better:
- the whole venue visible and true to scale;
- every drag has a keyboard and menu path;
- multi-date requests split per event;
- deterministic parsing with a review screen.

---

## 3. The prototype on `exp/stand-allocation`

**Run it:** `pnpm --filter @marktwerk/web exec next dev -p 3002` in the worktree, then open
`/postfach` and `/standplan`. It needs the usual Docker Postgres and dev login.

**Data:** venues, rows, events and vendors are read **read-only** from the dev database. Demo mails are
generated deterministically from real vendors. Placements, layouts and "sent" mails are kept in
**localStorage**. No migrations, and nothing is sent. "Demo zurücksetzen" clears the local state.

| Piece | Where | What it does |
|---|---|---|
| Form-mail parser | `packages/core/src/bookings/request-mail.ts` (+ tests) | Fixed `Key: value` layout. Multi-line note, German dates and lengths ("3,5 m", "350 cm"), Stammplatz text ("Reihe A, ca. 40 m"). Lists **every** broken field instead of guessing. |
| Placement rules | `packages/core/src/bookings/placement.ts` (+ tests) | `checkFit` (row end, overlap, car slots, power, optional gap rule), `nearestFit` (drop lands where dropped or slides to the nearest valid spot), `autoPlace` (Stammplatz row first, then first fit, largest first), `quoteStall` (started half metres billed), `stallNumber` ("A-12"). |
| Demo loader | `apps/web/src/server/standplan/demo-data.ts` | Builds about 50 mails: form requests for the next 4 events, some for two dates, one broken template and 4 normal mails. Splits requests per date and matches them to events. Fills about half of each plan with "existing" bookings. |
| Postfach | `/postfach` | Folders: Posteingang / Standanfragen / Nicht erkannt / Sonstige / Gesendet. The reading pane shows the **original next to the recognised fields** with ✓ / ⚠ / ✕ per field, plus the status per date and a link into the plan. |
| "Passt nirgends" | Standplan, request cards, details, drop toast, "Platzieren in …" | `explainNoFit` / `explainUnplaceable` (core, tested) name the reason per row: no power, no cars allowed, car spaces full, row too short, largest free gap too small, or the gap rule. Cards that fit nowhere show a red note with the reasons and a tip; a failed drop says why for that row; rows that can't take the stall are disabled in the menu. |
| Postfach (mail browser) | `/postfach`, `/postfach/neu`, `/einstellungen/mail` | Built from the spec `docs/superpowers/specs/2026-11-04-postfach-mail-browser-design.md`: three shared mailboxes, status Offen/Wartet/Erledigt, assignee, notes, Tiptap composer with templates, variables, signature and event block, drafts, send with undo. Actions: sender recognition, simulated contact/vendor, free-text request → Standplan, simulated permit/location filing, history. Standplan confirmations land in the vendor's conversation. |
| Versionen (drafts) | Standplan, side panel + "Als Version speichern" | Save the current proposals as a named version **without sending any mail**, try other arrangements, load an older one (undo toast). "Nicht gespeichert" / "Gespeichert" badge. Loading never touches confirmed stalls; a draft stall that collides with a stall confirmed in the meantime is skipped and counted. Only "Bestätigen" sends mail. |
| Standplan | `/standplan?veranstaltung=<id>` | Event chosen **on the right**, requests listed with notes, Stammplatz, car and power. **Drag onto rows** with a live drop preview (red if it doesn't fit). Autoplatz → proposals → "n bestätigen und Mail senden" (assigned + mail in Gesendet). Undo toasts. Keyboard: ← → 50 cm, ↑ ↓ change row, Entf removes. A "Platzieren in …" menu as the click path. **Layout bearbeiten:** move and rotate rows, and put an aerial photo or the paper plan underneath (opacity, width in m). **Drucken:** A4 landscape plan plus the crew stall list. |

Checked in the browser:
- recognised and broken mails;
- drag → A-36;
- Autoplatz (11 proposed, 4 without a car space);
- confirming 12 → 12 mails in "Gesendet" with the correct price;
- layout move and rotate;
- print sheet;
- no console errors.

### Known prototype limits

- State is per browser. Two people don't see each other's placements, and nothing is audited.
- Moving a confirmed stall turns it back into "proposed" (it needs a new confirmation). There is no
  "changed" mail yet.
- A stall uses the booked length. A car longer than the stall is not checked yet (glossary: car length ≤
  booked length).
- No restricted or blocked zones, and no per-row surcharges.
- No Platzkarte PDF. Plain-text mail only.
- **Parking / car spaces:** today a row only has "cars allowed" and a number of car spaces
  (`row.car_allowed`, `row.car_slots`); cars are not drawn on the plan. In the dev data some venues (e.g.
  Troisdorf – Stadthalle) allow no cars at all, so every "Auto am Stand" request there fits nowhere.
  **Open question for the client:** how does the office handle cars today: behind the stall per row,
  a separate vendor parking area, or decided on site? The answer decides whether car spaces become
  their own map objects.
- Versions are per browser, like everything else in the prototype. For real: a `plan_version` table
  (event, name, author, created_at, placements jsonb). Loading one becomes a service call with an audit entry.

---

## 4. Plan to build it for real (proposal, needs product-owner decisions)

1. **Schema (M9 slice).**
   - Tables:
     - `booking_request`: source, `message_id` unique, `request_ref`, raw payload, parse result, status.
     - `booking_date`: vendor, event, length, car, power, preferred row/offset, note, placement `row_id`,
       `start_cm`, `end_cm`, placement status, `price_snapshot_cents`.
   - An exclusion constraint per event + row on `int4range(start_cm, end_cm)` (btree_gist), so two stalls
     can never overlap, even with two people working at once.
   - Services: `placeStall` / `moveStall` / `unplaceStall` / `confirmPlacements`. Each is permission →
     transaction → `audit_log`.
2. **Vendor matching.** Match or create a `vendor` by email or name (a review step, never silent). Link the
   `booking_date` to the vendor, so Stammplatz and history come from our data, not from the mail text.
3. **Inbox (M11).**
   - Graph application permission scoped to the booking mailbox. A webhook plus delta sync into
     `email_message`.
   - The parser runs on arrival:
     - ok → `booking_request` (status `new`);
     - errors → the "Nicht erkannt" queue plus an alert ("form changed").
   - Idempotent on Message-ID + Anfrage-ID.
4. **Confirmation (M10).**
   - `outbound_message` with a vendor recipient (today it is staff-only) and a template in "Sie", plus a
     Platzkarte PDF.
   - Sent from the shared mailbox once `emailEnabled` is switched on.
5. **Layouts (M14).**
   - `venue_layout` (row geometry + backdrop document), copied into `event_layout` and editable per date.
   - Blocked zones with notes.
   - Export: the crew print and the Lageplan for authorities (with scale bar and escape routes).
6. **Public form (Phase 4, later).** The same core rules (`checkFit`, gap rule, `quoteStall`) power a
   vendor-facing picker with a timed hold, as melan does, but with the whole plan visible.

### Questions for the product owner (log answers in `open-questions.md`)

- **Form layout:** is the `Key: value` layout above OK for the new website form? Or should the website post
  JSON to marktwerk directly (more robust, no parsing)?
- **Gap rule:** on by default? Which minimum gap and edge distance (melan: 2 m / 3 m)?
- **Billing:** whole metres (melan) or half metres (prototype)? Surcharges for corner, main row or
  electricity?
- **Moving a confirmed stall:** a new mail every time, or only above a threshold (other row / more than 2 m)?
- **Platzkarte:** PDF attachment or a link? Is a QR code wanted for check-in on site?
- **Paper stall maps per location** (already open in the Bookings questions): needed as backdrops.
- **Obsidian sync:** set up the `docs/<Tool>.md` → Obsidian sync for marktwerk? HANDOFF says to ask
  before adding it.
