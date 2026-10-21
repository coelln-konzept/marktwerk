# Research 07 — Resources & money: inventory/rentals, payables & receipts, market P&L, vehicles

*Follow-up research to the client meeting (research 05), 2026-10-21. Sources are search snippets. Legal/tax points are from secondary sources; confirm with the tax advisor.*


I used about 33 searches. WebFetch failed (DNS/proxy), so the claims below come from search snippets of the cited pages. Each claim names its source. Statements about German law come from secondary sources (IHK, Big-4 tax notes, vendor blogs). The tax advisor should confirm them.

---

## A. Event equipment and rental planning software: how they model it

**Item types vs serialized items.** Every major tool uses the same split:
- **Bulk/quantity items:** a stock count only.
- **Serialized items:** each unit has its own ID or QR code.

The vendors:
- **Rentman:** "Bulk items are not tracked individually…" and serialized items use serial numbers and QR codes ([Rentman](https://support.rentman.io/hc/en-us/articles/16459216697106/)).
- **Current RMS:** "Bulk… enter a stock level and the system keeps count" vs "Serialised… add a list of assets" ([Current RMS](https://help.current-rms.com/products/create-a-product/create-stock-levels-for-your-products)).
- **Booqable:** "trackable" vs "bulk" (cutlery example). The type **cannot be changed after creation** ([Booqable](https://help.booqable.com/en/articles/99180)).
- **EZO (EZOfficeInventory):** "Assets" (individual) vs "Asset Stock" (consumables), with "bundles" as kits ([EZO](https://ezo.io/ezofficeinventory/blog/overdue-items-availability/)).

Cables, boxes, tables and standpipes are bulk.

**Availability per date range.**
- Booqable shows availability only once an order period is set ([Booqable](https://help.booqable.com/en/articles/99552-how-to-add-products-to-an-order)).
- Rentman calculates availability from each item's **planning period**. It separates the time gear is *reserved* (load, build, transport, teardown) from the time it is *charged* ([Rentman](https://support.rentman.io/hc/en-us/articles/27733339768594-Planning-equipment)).
- Moving a project's dates triggers a recalculation, which can create new shortages ([Rentman](https://support.rentman.io/hc/en-us/articles/17035832287506-Resolving-New-Equipment-Shortages-After-Project-Shifts)).

**Shortage warnings.**
- Rentman: if planned quantity is above stock, a red line appears on the availability timeline. A global **Shortages module** lists all shortages grouped by project ([Rentman](https://support.rentman.io/hc/en-us/articles/360017698379-Why-is-some-planned-equipment-highlighted-in-red)).
- Rentman's **"Solve shortage"** dialog offers four options, each shown green (usable) or red (not usable): alternative item, internal subrent from another warehouse, external subrental, or transfer ([Rentman](https://rentman.io/product-updates/solving-equipment-shortages-with-alternatives-and-subrentals)).
- Current RMS **allows overbooking by default**, so an order can still go out and the shortage is sub-rented later. Limits can be enforced in settings ([Current RMS](https://help.current-rms.com/articles/660540-prevent-overbooking-of-products)).

**Sub-rentals (renting from others).**
- Current RMS: you mark opportunity items as sub-rented. On return they land in a "supplier returns" quarantine that flags them to send back ([Current RMS](https://help.current-rms.com/opportunities/sub-rentals/sub-rent-products)).
- Rentopian: status goes received → returned, plus a **dashboard widget for upcoming returns** ([Rentopian](https://help.rentopian.com/en/articles/10217040-subrental-management)).
- Flex: creates rental purchase orders. Its "Receiving a Rental PO" list shows any PO with an "Order By" date in the next 7 days ([Flex](https://helpcenter.flexrentalsolutions.com/hc/en-us/articles/4402431692951-Receiving-a-Rental-PO)).
- Rentman moves sub-rental cost straight into project financials: daily price × reservations × days ([Rentman](https://rentman.io/product-updates/more-insight-in-your-costs-and-revenue)).

**Packing lists, check-out and check-in.**
- Flex turns a confirmed quote into a **pull sheet** grouped by case or zone ([Flex](https://www.flexrentalsolutions.com/?p=2294)).
- Cheqroom statuses:
  - Reservations: Draft → Booked → Converted to check-out, or Closed/Cancelled. A reservation that should already have been picked up becomes **Overdue**.
  - Check-outs carry a **due date** and become Overdue when items are not back on time. Push notifications fire 1 hour before and 1 hour overdue ([Cheqroom](https://help.cheqroom.com/articles/741084-check-out-overview), [Cheqroom](https://help.cheqroom.com/articles/741049-reservation-overview)).
- Sortly: minimum-quantity alerts, plus separate date alerts for maintenance, warranty and expiry ([Sortly](https://help.sortly.com/hc/en-us/articles/360009155191)).

**Simplest viable subset:** bulk item types, a quantity requirement per market, availability computed over a date window with buffer days, a shortage list, a "solve shortage → create rental" action, and rentals with due dates and reminders. A packing list is just a printout of the requirements. Skip serialized items, warehouses, transfers and scanning.

**Domain detail for standpipes (Standrohr).** City utilities attach strict terms. Examples:
- A maximum of 6 months, then **+€10/day** if late; €800 deposit (GGEW).
- Return by **15 December** each year or a €50 penalty (WV Vorsfelde).
- The standpipe must be shown to the utility every 3 months (Maxhütte-Haidhof).
- Daily fees run from about €0.77 to €8; deposits from €150 to €1,000.
- Water use is billed from the **meter reading** ([GGEW](https://ggew.de/uploads/Mietvertrag-fuer-Standrohre.pdf), [Vorsfelde](https://wvvorsfelde.de/wp-content/uploads/2023/09/Nutzungsvereinbarung_Standrohrverleih.pdf), [Kirchen](https://www.kirchen-sieg.de/fileadmin/dokumente/FG_6.1_kaufm_Betriebsfuehrung/Standrohrflyer_ab_01.01.2026.pdf)).

So a rental needs fields for the deposit, the late penalty and the meter readings at pickup and return.

---

## B. Payables, installments and receipt capture (German SMEs)

**What the tools do.**
- **Candis:** multi-step approval with deputies and **automatic reminders for pending approvals**. It is a licensed DATEV partner and passes the payment due date to DATEV. SEPA-XML payments. One review gives a price of about €389/month, which is overkill for this company ([Candis](https://candis.io/produkt/rechnungsmanagement), [Candis DATEV](https://www.candis.io/funktionen/datev-schnittstelle), [ki-syndikat](https://www.ki-syndikat.de/tools/candis/)).
- **Lexware Office:**
  - Scan app with OCR for amount, date and supplier. Users say OCR on photos is "hakelig" (unreliable); PDFs work better.
  - **"Offene Posten"** shows unpaid supplier invoices and overdue items.
  - "Belegempfang" automatically imports emailed invoices from up to 20 senders ([Lexware](https://www.lexware.de/funktionen/offene-posten-liste/), [trusted.de](https://trusted.de/lexoffice)).
  - **No product I found supports native installment schedules on incoming invoices.** marktwerk would add real value here.
- **GetMyInvoices:** pulls invoices from 10,000+ portals, email inboxes and an app, and exports to DATEV. Fully automatic transfer into DATEV has historically been limited ([DATEV community](https://www.datev-community.de/t5/Unternehmen-online/Candis-getmyinvoices/m-p/66775)).
- **Qonto:** syncs receipts to transactions via the DATEV Belegbilderservice ([Qonto](https://support-de.qonto.com/hc/en-us/articles/23949214182545-How-to-synchronize-attachments-with-the-DATEV-Belegbilderservice-and-Qonto)).
- **Common pattern across Spendesk, Moss and Pliant:** capture → extract → **match to a payment** → check → archive ([Spendesk](https://www.spendesk.com/de/blog/belege-digitalisieren-scanner-ocr-archivierung-vergleich/)).

**Getting receipts to the tax advisor (DATEV).**
- **DATEV Upload Mail** is the cheapest route. You forward emails to a predefined address for each document type, and attachments go into DATEV Unternehmen online "Belege". **Up to 10 PDF/TIFF files per email.** Sender addresses are registered once. It needs the client's DUo contract and rights set by the advisor ([DATEV community](https://www.datev-community.de/t5/Unternehmen-online/Neuer-Belegzugang-DATEV-Upload-Mail/td-p/132002), [softguide](https://www.softguide.de/presse/aus-der-e-mail-direkt-in-die-sichere-cloud-belegzentrale-datev-upload-verei)).
  - Consequence: **convert phone JPEGs to PDF** before sending.
  - You cannot attach booking notes via mail or the app ([DATEV community](https://www.datev-community.de/t5/Unternehmen-online/Buchungsinfos-Belegupload/m-p/311515)), so put the market and category into the PDF filename or onto a cover page.
- The official REST APIs (`accounting:documents` for uploading to Belege online, plus the Buchungsdatenservice) require becoming a DATEV marketplace partner. That is heavy for an internal tool ([DATEV developer](https://developer.datev.de/datev/platform/en/product/28387)).

**German legal points.**
- **Replacing paper with scans or photos (ersetzendes Scannen):** allowed, including **with a smartphone**. The DStV/BStBK model documentation names "Scanner, Multifunktionsgerät oder Smartphone" ([DStV Muster-VD](https://dstv.de/download/zu-tb-140-15-we-musterverfahrensdokumentation-geschuetzt), [Candis blog](https://candis.io/blog/ersetzendes-scannen)).
  - It requires a written **Verfahrensdokumentation** (who scans, which device, quality control; GoBD Rz. 136).
  - The image must be complete, legible, unalterable and traceable.
  - Paper may be destroyed **only after** this is in place.
  - Originals whose physical features carry evidential weight must be kept ([iww](https://www.iww.de/bbp/unternehmensberatung/betriebspruefungssicheres-scannen-traue-keinem-scan-den-du-nicht-selbst-mit-einer-guten-qualitaetskontrolle-ueberprueft-hast-f139662), [DATEV Leseprobe](https://www.prod.datev.de/content/dam/markenassets/verlagsmedien/shop_fachliteratur_medien/leseproben/32328_leseprobe.pdf)).
  - Thermal receipts fade, so photograph them immediately ([sparkreceipt](https://sparkreceipt.com/de-de/blog/belege-digitalisieren-kassenbons/)).
- **Retention:** booking records (Buchungsbelege) dropped from 10 to **8 years** under BEG IV (§147 Abs. 3 AO, §257 Abs. 4 HGB, §14b UStG). Business letters stay at 6 years, annual accounts at 10 ([IHK Karlsruhe](https://www.ihk.de/karlsruhe/fachthemen/steuerrecht/aktuelles/neuer-inhalt4-buerokratieentlastungsgesetz-6347138), [KPMG](https://assets.kpmg.com/content/dam/kpmg/de/pdf/Themen/2024/10/vat-newsletter-oktober-2024-kpmg-de.pdf)).
- **E-invoice receiving:** every B2B business must be able to **receive** e-invoices since **1 January 2025**, with no transition period. An email inbox is enough ([IHK Oldenburg](https://www.ihk.de/oldenburg/geschaeftsfelder/rechtundsteuern/beratung-steuer/e-rechnung-4504130)).
  - Issuing is phased in. Businesses with up to €800k prior-year revenue have until the end of 2027 ([Handwerksblatt](https://www.handwerksblatt.de/themen-specials/die-e-rechnung-wird-pflicht-tipps-fuer-handwerksbetriebe/e-rechnungspflicht-ab-2025-was-unternehmen-wissen-muessen)).
  - The **GoBD amendment of 14 July 2025** says the **structured XML is what must be kept**. The visual PDF is needed only if it contains extra tax-relevant information ([EY](https://www.ey.com/de_de/technical/steuernachrichten/konkretisierung-der-gobd-mit-blick-auf-e-rechnungen), [KPMG](https://kpmg.com/de/de/themen/2025/07/bmf-gobd-zweite-aenderung.html)).
  - Implication: for a XRechnung or ZUGFeRD invoice, a photo or screenshot is **not** the original. Store the file unchanged.

---

## C. Per-event budget and P&L

- **Rentman, Financial tab:** columns for **Estimated / Planned / Actual** costs, a quick profit figure and the amount invoiced so far. Categories: equipment, crew, transport, sub-rentals and **"additional costs"** (travel, meals, logistics). Sub-rental extra costs are split proportionally across the items ([Rentman](https://support.rentman.io/hc/en-us/articles/360013264720), [update](https://rentman.io/product-updates/more-insight-in-your-costs-and-revenue)).
- **Planning Pod:** **Estimated / Negotiated / Actual** per line item, grouped into categories with subtotals. Revenue streams (tickets, exhibitors, sponsors, merchandise) are tracked separately, with a break-even view and over/under-budget totals ([Planning Pod](https://planningpod.com/budgeting)).
- **Cvent:** actual vs estimated broken down by category, vendor and per head, with templates ([Cvent](https://www.cvent.com/en/event-management-software/event-budget-management)).
- **Eventtia template:** adds a **Committed** column (signed contract or PO) as the early warning before invoices arrive ([Eventtia](https://www.eventtia.com/event-budget-template/)).
- **Playcode close-out:** set an actuals cutoff, resolve open commitments, reconcile totals, then hand off a summary ([Playcode](https://playcode.io/blog/event-budget-template)).
- **Market-specific: Marketspread** sets **vendor fees per market day** (auto-invoice on stall assignment), lets you quickly find vendors with outstanding invoices, and has a "not attending" status. Portland Farmers Market charges a late fee after 31 days and suspends after 60+ days ([Marketspread](https://marketspread.com/learning/articles/day-of-week-vendor-fees/), [Portland FM](https://portlandfarmersmarket.org/wp-content/uploads/2024/12/Stall-Fee-Chart-April-2025-March-2026.pdf)).

---

## D. Small fleet maintenance

- **Fleetio:** a reminder has **time and/or meter intervals and triggers on whichever comes first**. A separate **"Due Soon" threshold** gives advance warning; without it the status jumps straight from OK to Overdue. It forecasts the odometer from average daily use ([Fleetio](https://help.fleetio.com/en_US/service-reminders-overview), [forecasting](https://help.fleetio.com/en_US/service-reminder-forecasting)).
  - About $4–10 per vehicle per month; vehicle renewal reminders, total cost of ownership, photos ([TrustRadius](https://www.trustradius.com/products/fleetio)).
  - Built-in reminders are US-centric (e.g. NHTSA recalls), so German HU and UVV would need custom reminders.
- **Simply Fleet:** has a free tier. Reminders by km or by days/months/years; driver app for inspections and fuel receipts. Users report data loss on a bad connection ([GetApp](https://www.getapp.com/operations-management-software/a/simply-fleet/)).
  - Lesson: make the driver form offline-tolerant, or at least retry uploads.
- **German tools:** Vimcar Fleet offers digital vehicle files and driver's licence checks via LapID ([Handwerksblatt](https://www.handwerksblatt.de/themen-specials/so-managen-sie-ihren-fuhrpark/ein-stecker-uebernimmt-die-verwaltung)). Overkill for a few vans.

**Legal intervals.**
- **Main inspection (HU/TÜV):**
  - Vans up to 3.5 t: first after 24 months, then **every 24 months**.
  - Over 3.5 t: **every 12 months**.
  - From 7.5 t: an additional safety check (SP).
  - Source: [Verkehrsrundschau](https://www.verkehrsrundschau.de/nachrichten/nfz-fuhrpark/tuev-report-2014-lkw-fahren-auf-hohem-sicherheitsniveau-2998951) (older source, but the rule is stable). Store each van's gross weight (zGG) and derive the interval from it.
- **Annual accident-prevention inspection (UVV-Prüfung, DGUV Vorschrift 70):** commercially used vehicles, transporters included, need it **at least annually**, done by a qualified expert, with a written record kept until the next check ([TÜV NORD](https://www.tuev-nord.de/de/dienstleistungen/pruefung-und-gutachten/uvv-pruefung/), [Ayvens](https://www.ayvens.com/de-de/fuhrpark-knowhow/artikel/management-und-kosten/uvv-pruefung-pkw/)). This is probably the obligation the company does not know about today.
- **Driver's licence checks** are part of the keeper's liability duties (Halterhaftung) from the first vehicle ([Alphabet brochure](https://showroom.alphabet.com/files/0130-04_al_br_uvv_fsk_brosch_01.pdf)). Semi-annual is common practice, not law. Mind GDPR (DSGVO): store only the date checked and who checked, not licence scans.

---

## E. Build vs integrate

**Option 1 – marktwerk does operational pre-entry; the tax advisor does the books (recommended).**
- marktwerk owns payables, installments, market assignment, receipt collection and reminders.
- It exports to the advisor via DATEV Upload Mail, or a monthly ZIP with a CSV index.
- Pros: no accounting liability, fits a small company, the advisor keeps DATEV, cheap.
- Cons: bank reconciliation stays manual.

**Option 2 – integrate with Lexware Office or sevDesk (only if the company already uses one).**
- Lexware API:
  - Files are uploaded via `POST /v1/files` (type=voucher).
  - Vouchers carry `dueDate` and a status (open/unchecked). Open amounts come from the payments endpoint.
  - Limit of 2 requests per second.
  - **About one month of approval lead time** before API keys are issued.
  - Base URL is now `api.lexware.io` ([chift](https://www.chift.eu/blog/lexware-office-api-integration-best-practices-and-key-insights), [veryfront](https://veryfront.com/docs/cloud/integrations/lexoffice)).
- sevDesk: two steps, `Voucher/Factory/uploadTempFile` then `saveVoucher`. It accepts ZUGFeRD and XML ([sevDesk tech](https://tech.sevdesk.com/api_news/posts/2024_11_15-upload-einvoice/)).
- Pros: OCR, bank matching and archiving come for free.
- Cons: two sources of truth, sync bugs, subscription cost, and neither supports installment plans.

**Option 3 – Candis:** too expensive and too process-heavy for a handful of users.

---

## Recommendations for marktwerk

### 1. Inventory and rentals: minimal model

Tables:
- `item_type(id, name, category[cable|power_box|table|standpipe|…], unit, owned_qty, out_of_service_qty, notes)`
  - Bulk only for now.
  - Add a `tracking` enum later; choose it at creation, like Booqable.
- `market_template_requirement(series_id, item_type_id, qty)`
  - Copied into `market_requirement(market_id, item_type_id, qty)` when a recurring market occurrence is created, then editable.
- **Allocation window** per market: `setup_start` (e.g. the day before) to `teardown_end` (the day after). This mirrors Rentman's planning period vs charged period.
- **Availability:**
  - availability(type, window) = owned − out_of_service − Σ requirements of *overlapping* markets + Σ active rentals of that type in the window.
  - Compute it live. With about 20–30 markets a year, no caching is needed.
  - **Shortage** = negative availability.
  - Show it on the market page (red row) and on a global "Engpässe" list grouped by weekend, which matters because up to 4 markets can share one weekend.
- **Allow overbooking with a warning** (the Current RMS default). Never block saving.
- `rental(id, supplier, item_type_id, qty, market_ids[], pickup_date, due_return_date, returned_at, status[planned|picked_up|returned|overdue], responsible_user, deposit_amount, deposit_refunded_at, fee_per_day, late_fee_terms, meter_start, meter_end, contract_file)`
  - Add a **"Engpass lösen → Anmieten"** button that prefills qty = shortage and dates = window (Rentman pattern).
  - Reminders go to the *responsible person*:
    - T−3 days and on the due date;
    - daily while overdue, escalating to the boss after 1 day;
    - a separate reminder for a deposit not yet refunded.
  - Add an "upcoming returns" dashboard widget (Rentopian).
  - Rental fees automatically become a planned cost on the market P&L.
- **Packing list:** a printable or mobile checklist of requirements and rentals per market, with optional "loaded" and "returned" counts. A mismatch on return creates an "Item missing/defect" task and lowers `out_of_service_qty`. No barcodes.

### 2. Payables, installments and receipts

- **One money record:** `payable(id, counterparty, title, scope[market|company|vehicle], market_id?, vehicle_id?, category, total_gross, vat_rate, priority_flag[critical: permit/landlord/penalty], notes)`.
- Children: `installment(id, payable_id, due_date (date-only), amount, status[open|paid|partially_paid|cancelled], paid_at, paid_amount, paid_by, method)`.
  - A generator splits a total into N installments every M months, or takes free-form rows.
  - Validate that the installments add up to the total, and show a warning if they don't.
- **Marking an installment paid *is* the expense booking.**
  - The P&L and the finance view read from installments.
  - A market task such as "Genehmigungsgebühr bezahlen" *links* to its payable instead of keeping its own amount. That gives single entry.
- **Receipts are evidence, never transactions.**
  - `document(id, file, sha256, mime, uploaded_by, uploaded_at, kind[receipt|invoice|e_invoice_xml|contract], linked_payable/installment/expense_id, market_id?)`.
  - Use `<input type=file accept="image/*,application/pdf,.xml" capture="environment">`.
  - Ad-hoc purchases (fuel, cable ties) are an `expense` with a document. Show a **"missing receipt" counter** for paid items without a document.
- **Reminders:** at 14 days, 3 days and on the due date, then repeatedly while overdue, sent to the finance role.
- **Priority score:** overdue days × weight, critical flag first, then due date, then amount.
- **Finance-only filter:** role-based visibility plus a dashboard toggle.
- **Export:** a monthly bundle where JPEGs are converted to PDF and named `YYYY-MM-DD_Lieferant_Betrag_Markt.pdf`, plus a CSV. It goes via DATEV Upload Mail (max 10 per email) or as a ZIP to the advisor. E-invoice XML/ZUGFeRD files are passed through byte-identical.
- **GoBD caveats:**
  - Position marktwerk as a capture and forwarding tool, **not** the archive of record.
  - Tell the company to keep paper until the advisor confirms a Verfahrensdokumentation (the DStV template exists).
  - Make documents immutable: no hard delete, soft-delete with an audit log, and keep the SHA-256 hash.
  - Store originals rather than OCR text only, and keep them at least 8 years if they are retained at all.
  - Add a quality check (preview and "is it legible?" confirmation) before saving.

### 3. Market close-out P&L

- **Revenue lines:** stall fees per vendor (amount due vs paid, from vendor bookings), entry tickets, parking, catering commissions, sponsors.
- **Cost lines by category:** location/rent, permits, power/water (Standrohr), equipment rentals, staff/helpers, security, cleaning/waste, toilets, marketing, GEMA, transport/fuel, other.
- **Columns:** **Plan → Committed (payable created) → Actual (paid)**, plus variance, combining Eventtia and Rentman. Show net amounts with VAT tracked separately.
- **Close-out wizard:**
  - Unpaid vendors, with a list to send reminders to.
  - Open installments tied to this market.
  - Paid items without receipts.
  - Rentals not yet returned and deposits outstanding.
  - Missing or damaged equipment.
  - Free-text "lessons learned".
- **Then:** status becomes `closed`. Store a snapshot of the totals; later changes are allowed but logged. Compare the same market series year over year.

### 4. Company tab: vehicles and recurring obligations

- `vehicle(plate, model, vin, first_registration, gross_weight_kg, odometer, insurer, policy_no, insurance_renewal, notes)`.
- **One generic `obligation` engine** for everything recurring:
  - `obligation(title, scope[company|vehicle|market_series], vehicle_id?, interval_months?, interval_km?, next_due_date, next_due_km, lead_days, owner, last_done_at, cost_category, creates_payable bool)`.
  - It triggers on whichever of date or km comes first, with a due-soon threshold (Fleetio).
  - Completing it records date, cost and document, then rolls the next due date forward.
- **Seed templates:**
  - HU: 24 months for vans up to 3.5 t, 12 months over 3.5 t.
  - UVV inspection (DGUV 70): 12 months.
  - Service: per manufacturer, date or km.
  - Tyre change.
  - Insurance renewals (vehicle insurance, event-liability insurance, equipment insurance).
  - Vehicle tax.
  - Driver's licence check: suggested every 6 months.
  - KSK artist-levy report by **31 March** (a zero report if nothing was paid) ([TK](https://www.tk.de/firmenkunden/versicherung/beitraege-faq-und-mehr/ksk-abgabesatz-2080164)).
  - GEMA registration per event that uses music.
  - Standpipe annual return or inspection.
  - Tax payment dates set by the advisor (unverified here: confirm with the advisor).
- **Driver issue reports:** photo, vehicle, severity, open/resolved. A "critical" issue shows a warning when the van is assigned to a market.
- **Odometer** entered after each market trip.
- **Cost per vehicle** = payables and expenses tagged with that vehicle.

### 5. Build vs integrate

Build the operational layer: payables with installments, reminders, market P&L, receipt inbox and rentals. **Do not build bookkeeping**: no chart of accounts, no bank reconciliation, no DATEV booking export. Ask the advisor first whether they use DATEV Unternehmen online. If yes, use Upload Mail. If the company already pays for Lexware Office or sevDesk, add a one-way push of documents and payables later; budget for Lexware's API approval time.

### 6. Traps

- **Double counting:** a receipt and a payable for the same cost. Link the receipt to the payable; never sum documents.
- **Gross vs net:** compute the P&L net. A VAT-registered company recovers input VAT.
- **Overlapping markets:** with 4 per weekend, the overlap logic must include setup and teardown buffers. Same-day handovers between markets need a manual "transfer" note.
- **Recurring templates:** editing a series template must not silently change past or closed markets.
- **Installment edits** after partial payment; rounding (€15,000 / 3 = €5,000, but €10,000 / 3 = €3,333.33 plus a remainder).
- **Date-only due dates:** store them as `date`, not timestamps, to avoid time-zone shifts with reminder jobs.
- **Reminder fatigue:** one daily digest per person instead of one email per item. Escalate only when overdue.
- **E-invoices:** a photographed screen or PDF render of an XRechnung is not the original. Keep the XML.
- **GDPR:** licence-check data and driver photos. Keep only what is needed and restrict access.
- **"Paid" ≠ bank-confirmed:** add an optional `paid_reference` field and later reconciliation, but don't block on it.
- **Booqable-style type lock-in:** if serialized items might be needed, keep `tracking` as a column from day one, even if only `bulk` is implemented.
