# Research 02 — How market & vendor-booking tools actually work

*Teardown from help-centre content (search snippets; direct page fetching was blocked in our
research environment). Depth: Marketspread and Eventeny high; German tools medium; MarketWurks
and Manage My Market shallow (no public docs).*

## Marketspread (the most relevant model)

**Objects:** Market → Event (season/series) → Event Days. Booths live on a Layout and are
priced per **Booking Term**. Vendor profile + Application per market/event. Documents
belong to the application. Invoices come from bookings.

**Two separate status layers (the most important pattern to copy):**
1. **Application status:** Incomplete, Applied, Received (locks editing), Pre-approved ("you're in, not scheduled
   yet"), Approved, Resubmit (reopens form for fixes), Declined, Withdrawn.
2. **Per-day status** per vendor per Event Day: Pending, Waitlist, Accepted, Rejected, Not Attending.
   **Assigning a booth on a day auto-sets that day to Accepted.**

**Workflow:**
- Layout Designer: grid (5×5 ft squares), add booth, resize in a "Booth Inspector".
- Price each booth per **term**: Day / Week / Month / Event (whole series = one invoice).
  Rentals (tables, power) priced per same term, on the same invoice.
- Application: vendor categories, document requests ("sign" or "upload") with **expiry date**.
- **Scheduler** = booth × day grid with a **pending counter per day** ("12 vendors want this
  day, no booth"). Click it → "pending bucket" → drag vendors into booths.
- Three booking modes: manager-scheduled; approved vendor self-books ("Book Now"); open booking
  (pick days/booths while applying).
- Invoices start as **drafts invisible to vendors**; "release" makes them visible and notifies.
  Status colours: yellow none, blue open, green paid, red overdue, grey clock scheduled release.
  Unassign with unpaid invoice → void; with paid invoice → refund or "do not refund".
- Vendors can request day changes; **once assigned a booth they can't remove themselves**.
- **"Double bookings":** on a season booking, mark one day as approved absence / unapproved
  absence / no-show, and the booth frees up for that day only. The season booking stays.
- Day-of: Vendors tab per day (booth, rentals, invoice status, check-in, attendance); Pass
  mobile app for check-in. ⚠️ **Auto-attendance by default hides no-shows** (trap).
- Assignment report: vendor × date season matrix to find one-off holes.

Gaps: per booth not per metre, card-only self-booking, no category caps.

## Eventeny
- Application statuses: Awaiting decision / Approved / Rejected / Waitlisted / Withdrawn; each
  change auto-emails the applicant; optional auto-approve.
- Recurring events: vendor picks dates inside one application; **organizer approves per date**;
  price per attended date.
- **Charge timing per item:** on submission / immediately after approval / scheduled date /
  manual. Instalments supported.
- Map editor: background = uploaded image, blank or Google Maps; booths listed in sidebar;
  **multi-select bulk edit**; **copy map** for next date; auto legend.
- Assign: click booth → "+ Assign" → approved applicant only.
- Self-select: shown only after approval; max booths per vendor; available booths lit, taken
  darkened; reserved only when selected **and paid**. Desktop-oriented (trap).
- Day-of: scan vendor QR or search by name / confirmation code.
- Complaints: 3% fees, refund/chargeback disputes, limited map/branding, email templates, learning curve.

## MarketWurks / Manage My Market
- MarketWurks: **vendor master-data changes go through a Change Request** reviewed by the market.
- Manage My Market: core screen **"The Matrix"** (stalls × dates by week/month/season); vendors
  see their stall per date; map built by MMM staff (not self-serve); fee pattern max(base fee,
  5% of sales); no-show still owes base fee.

## Floor-plan booking (ExpoFP, Map Your Show, a2z, Seen Markets, VendorsMap)
- ExpoFP: trace over uploaded PDF/CAD; draw/merge/resize booths; statuses Available → Reserved/Sold
  + **On Hold with auto-release after N days**, used as approval gate.
- Map Your Show: exhibitors request booths when applying; assignment by **priority points** or
  first-come; floor plan highlights flagged competitors ("not next to X").
- Seen Markets: background image **with adjustable opacity**; **unpaid holds expire**.
- VendorsMap: rows + numbered spots, satellite background (paid tier), bulk accept/waitlist/decline,
  "Market Day mode".

## German analogues
- **VOIS|MARKT** (municipal): market days **generated from rhythm + season**; vendors with certificates
  and encrypted bank data; scored applications; **Dauer- vs Tageszuteilung** with **Branchenmix check**;
  generated notices; **Tagesübersicht** with attendance and **Tagesabschluss** (daily cash close);
  audit trail; GDPR Art. 15 export.
- **Marktmeister Pro + Markttagmeister app:** flags **new vs returning applicants and differences
  from last application**; fees from fee schedule; **batch contracts and invoices**; graphical placement on
  scale plans; day-of app records present/absent and **writes back** to vendor data.
- **MERCATUS (CH):** weekly, flea and Christmas markets; market plan upload with automatic pitch
  detection; vendor portal to book/pay and download permit, pitch situation and invoice.
- Marktpilot (€29–99/mo), MarktOrga (€149 one-off, self-hosted).

### How German flea-market operators book today
- **Hochberg:** vendor picks market, enters **length, with/without car, covered or not** → system
  shows matching free pitches to click. Rule: car only if **length ≥ car length + 1 m**; depth ≈
  3.5 m with car, 1.5 m without.
- **Melan:** price per metre by category (Trödel vs Neuware, volume break from 5 m); online booking
  closes 12:00 the day before; free cancellation until T-7 / Wednesday before; PayPal online,
  direct debit for phone bookings, cash/EC on site.
- **Flohmaxx:** contract at confirmation, fee due immediately, **no right to a specific pitch**.
- Municipal rules: trial day pitch before permanent pitch; day pitches handed out at 07:30;
  **regular assignment creates no right to a pitch**; lottery at 08:00 if walk-ups exceed space.

## Synthesis → our booking model (Phase 2)

**Statuses are orthogonal layers, never one field:**

| Layer | Values |
|---|---|
| Booking (vendor × series/market) | `inquiry → submitted → needs_info → approved / waitlisted / declined / withdrawn` |
| Booking date (per market day) | `requested → accepted / waitlisted / rejected`, later `cancelled_by_vendor (in_time / late)` / `cancelled_by_organizer` |
| Placement | `unplaced → proposed (draft, e.g. regulars auto-fill) → held (expires) → assigned (published)` |
| Finance | `not_invoiced → draft → open → partially_paid → paid` (+ `overdue`, `voided`, `credited`) |
| Attendance | `expected → checked_in / approved_absence / unapproved_absence / no_show`, set explicitly at day close |

"Confirmed" (vendor-facing) is **derived**: accepted + assigned + invoice open or paid.
Assigning a placement auto-accepts the date.

**Space model:** Venue → Zone → **Row** (length m, depth, car allowed, power points, corner ends).
A placement is a **metre interval on a row** `[start_cm, end_cm]`. Fixed numbered pitches are just
pre-cut intervals. This supports per-metre pricing and car/depth rules. The map (Phase 3) draws
rows; it doesn't change the model.

**Regulars:** Stammplatz = *preference* (row + offset + length + priority), not a right. "Apply
regulars" on a new market creates `proposed` placements + conflict list; regulars confirm by
opt-in (or by not opting out before a cutoff); unconfirmed → `unplaced` at cutoff.

**Patterns to adopt:** Scheduler/Matrix grid with pending counters; season bookings with per-date
absence override; draft → release invoices; status dots in every grid; charge timing per item;
add-ons priced per term; category price per metre with volume breaks; batch invoicing; category
caps (cap per category + "max 2 selling the same thing", with exemptions, over-cap → waitlist);
new vs returning + diff vs last application; change requests for vendor master data; holds with
auto-expiry; copy map to next date; auto emails on status change; explicit day close-out.

**Traps:** one status field; cancelling a season booking to free one date; auto "attended";
Stammplatz as a right; card-only payment; fixed booths only; map as a prerequisite; holds that
never expire; vendors seeing draft invoices; inconsistent status vocabulary (we keep one
DE/EN glossary).
