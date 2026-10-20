# Research 01 — Market landscape, German domain rules, payments

*Researched 2026-10-20. Sources are mostly search snippets of vendor, government and advisory
pages (direct page fetching was partly blocked). Prices marked "3rd-party" come from directories.
**Nothing here is legal or tax advice. Items marked ⚖️ must be confirmed with the client's
Steuerberater / lawyer before we build them.***

## 1. Landscape in one paragraph

US market SaaS (Marketspread, Eventeny, Manage My Market, ShowUp) handles vendor applications,
map booking and card payments well, but it's US-centric and has no ops or compliance side.
German tools target **municipal market offices** (VOIS|MARKT, myMERCATUS), **Christmas and annual
markets** (Marktpilot, Mercalix Fusion, MarktOrga) or **trade fairs** (ProFairs, FairUp). We found
**no product for private, recurring flea-market operators** that combines ops checklists, permits,
booking, German invoicing and field mode. Incumbent workflow: PDF Marktordnung + email/JotForm form,
bank transfer (Vorkasse) or cash on the day, sometimes Eventbrite / city ticket shops.

## 2. Reference products

| Product | What to copy | Gaps for us |
|---|---|---|
| **Marketspread / Farmspread** | Apply → pick day → pick space on map → pay → QR with space number at gate ([De Anza](https://www.deanza.edu/fleamarket/apply)). Fees per weekday and per vendor, invoice release rules ([docs](https://marketspread.com/learning/article/137/day-of-week-vendor-fees/)). One "organization" across several markets with delegated managers. | USD, no German VAT/e-invoicing, no permits, no ops checklists |
| **Eventeny** | Self-serve booth pick on map with organizer-controlled availability and price per booth; installments; freemium (vendor mgmt free, map paid; Pro $240/mo) ([pricing](https://www.eventeny.com/pricing)) | One-off festival focus; recurring dates weak |
| **Manage My Market** | **One vendor profile reused across seasons and markets**; approve / decline / **waitlist**; license and insurance expiry per vendor; stall assignment by manager | Vendors can't self-select; maps extra |
| **ShowUp** | Per event: approval-based **or** instant booking | Thin info |
| **ExpoFP** | Floor-plan designer: add / **merge** / move booths; booth types as SKUs; exhibitors reserve and pay on the plan. ~$55 per 1,000 m²/mo (3rd-party) | Visual add-on only |
| **Marktpilot / Mercalix / MarktOrga** (DE) | Click-placing stands on a real map; **carry data over from prior years**; waitlists; self-hosted, one-time license (MarktOrga) | Christmas/municipal focus, no ops |
| **VOIS\|MARKT, myMERCATUS** (DE, municipal) | Dauer- vs Tagesplätze, fee notices, accounting interfaces | Built for authorities |
| **Front / Missive** | Per thread: assign, comment internally, snooze, close; rules engine; shared drafts; CRM sidebar. Front $25–105/seat, Missive $14–36/user | No domain awareness. **Our edge: email → booking/task in one click, vendor matched by sender** |
| **Crescat / FestivalPro** | Day sheets, run-of-show, crew roles, **duplicate event for recurring events**; FestivalPro takes 2% on invoices | Overbuilt for stages/artists |

## 3. How German flea markets price and run today (real examples)

- Per **laufender Meter**: €4/m (Saarbrücken), €5/m, €6/m up to 1 m deep / €8/m deeper (Munich Theresienwiese)
- **Neuware** (new goods) priced higher (€22/m Krefeld); many markets ban commercial / new goods, especially on Sundays
- **Corner surcharge** €30 for stands ≥ 6 m
- **Car behind stand** only from 4 m (van 5–6 m); some charge the car length if the car is longer than the stand
- Flat rate up to 4 m, then €6 per extra metre (Ebersberg)
- €2.50 reservation fee, binding only once paid; bookings ≥ 6 m close T-8d (Harz+Heide)
- Rules: no cancellation/refund; **reserved spot released if not occupied by 07:30**; max 2 stands per person; walk-up registration from 07:00
- Scams on listing portals (PayPal to private addresses). A branded, verified booking page is itself a trust feature.

→ **Pricing engine requirements**: price per metre with min/max length; "flat up to X m, then per
metre"; private vs commercial / used vs new rates; surcharges with minimum-length conditions
(corner, car, van); power; reservation fee; early/late fees; per-person stand limit; locked
prices for regulars; season passes.

## 4. Regulatory map (organizer side)

| Item | What it is | Lead time (local, configurable) |
|---|---|---|
| **Marktfestsetzung §69 GewO** | Voluntary designation per occurrence; organizer then *obliged* to hold the market. Münster wants Führungszeugnis, Gewerbezentralregister extract, tax certificate, liability insurance, **vendor list, Lageplan, Teilnahmebedingungen** | T-60…90d |
| **Sunday/holiday law (Landesrecht)** | Biggest risk: courts and authorities restrict *commercial* Sunday flea markets (VG Neustadt, Braunschweig, Biberach). Typical condition "no Neuware on Sunday" | Per venue/Bundesland flag |
| **Sondernutzungserlaubnis** | Use of public streets/squares | T-4…8w |
| **Verkehrsrechtliche Anordnung** | Closures, no-parking signs (Straßenverkehrsbehörde) | T-4…8w |
| **GastG §12 Gestattung** | Only when **alcohol** is served; per vendor per event in Bavaria; ≥ 2 weeks | T-2w |
| **GEMA** | Any public music incl. background speakers; register **in advance** (else up to double tariff) | Before event |
| **Sicherheitskonzept** | Thresholds vary by state; Greven wants 3 months ahead, rejects < 8 weeks; Bad Homburg allows a short concept for flea markets. Content: escape routes, fire lanes, emergency access | T-90d |
| Landowner contract, insurance, waste, toilets | Private contracts / suppliers | Template tasks |

→ Permits are **configurable requirement templates per venue** with lead times, not hard-coded
rules. The stall map later doubles as the **Lageplan** for authorities (fire lanes, widths).

## 5. Invoicing & tax ⚖️

- **VAT:** renting stall space is generally **VAT-exempt (§4 Nr. 12 UStG)**. Ancillary services
  (power, cleaning, organisation) share the exemption (BFH V R 5/13). Separately sold items
  (table rental, ads, food concessions) may be **19%**. → **tax code per invoice line**, with the
  exemption note printed. §9 option for B2B and §19 Kleinunternehmer template also possible.
- **E-Rechnung:** receiving is mandatory since 2025. Sending is mandatory for domestic B2B
  **from 2027 (turnover > €800k) / 2028 (all)**. Exceptions: invoices **≤ €250 gross**, B2C, and some
  exempt supplies. → private sellers mostly out of scope; commercial traders with regular or season
  contracts are in scope. Plan **ZUGFeRD/XRechnung (EN 16931)** generation in the invoicing phase.
- **GoBD:** issued invoices immutable, corrections via Storno/credit note, gap-free numbering,
  revision-safe archive, audit log. Retention **8 years** for invoices/receipts (since 2025), 10 years
  for books. Client needs a *Verfahrensdokumentation*, and we can provide a template.
- **Cash (KassenSichV, §146a AO) ⚖️ — important:** an *open cash box* (offene Ladenkasse) with a daily
  **Kassenbericht** needs no TSE. **As soon as an app records individual cash sales it is an
  electronic record-keeping system**: TSE signing (cloud TSE e.g. fiskaly), receipt obligation
  (e-receipt allowed) and **ELSTER registration** within one month. Options for field mode:
  - (a) integrate a cloud TSE;
  - (b) app records only card payments (SumUp) + check-ins, cash stays in an open cash box and
    the app only guides the daily Kassenbericht (counts, not individual sales);
  - decide with Steuerberater before Phase 3.

## 6. GDPR

EU hosting; AVV/DPA with every processor (hosting, email, storage, AI); Art. 30 records; data
minimisation (avoid ID scans); deletion concept (rejected applicants deleted quickly, invoice data
kept 8 years); role-based access to inbox and finance; any AI triage of email named in the
privacy notice and run on EU / no-training terms.

## 7. Payments & accounting

| Provider | Use | Notes |
|---|---|---|
| **Bank transfer** (client's current method) | Default | Unique reference per invoice + **EPC/GiroCode QR** on invoice; later CAMT.053 import or bank feed for matching |
| Stripe / Mollie | Optional online payment later | Mollie is EU-native; both offer PayPal, SEPA, Wero (coming) |
| **SumUp** | Card on site | Cloud API pushes checkout to Solo reader; handles its own fiscal duties |
| **Lexware Office** (lexoffice) | Accounting sync option | REST API, ~2 req/s, key approval can take weeks |
| **sevDesk** | Accounting sync option | Can produce ZUGFeRD/XRechnung via API |
| **DATEV** | Tax advisor export | Buchungsstapel CSV (EXTF format) + documents via DATEV Unternehmen online |

Strategy: issue GoBD-compliant invoices ourselves and **export/sync** to whatever the tax advisor uses.

## 8. Implications carried into the plan

1. Recurring-first model (series → market instances; copy from last date/year).
2. Permit requirement templates with relative deadlines per venue; Sunday/commercial flags per market.
3. Pricing engine as a rules list, not hard-coded columns.
4. Booking lifecycle with configurable approval vs instant, waitlist, payment-deadline binding,
   07:30 no-show release.
5. Reusable vendor profile with expiring documents.
6. Invoicing built for GoBD from the first invoice; e-invoice export in its phase.
7. Field-mode cash: legal decision needed (TSE vs open cash box) ⚖️.
8. Shared inbox: Front/Missive basics + email → booking/task conversion.
