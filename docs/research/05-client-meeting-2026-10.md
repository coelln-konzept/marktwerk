# Research 05 — Client meeting (October 2026): workflows, pain points, wishes

*Source: transcript of an on-site meeting with the company's management (owner side) and the
marktwerk team. The transcript is machine-generated and noisy (German/English mix, misheard
names and places). Below are the business-relevant findings, paraphrased, with confidence notes
where the transcript is ambiguous (❓). Off-topic personal conversation is deliberately left out.
**This meeting outranks earlier desk research: they are the users.***

## 0. People mentioned (roles as far as recognisable)
| Name (as transcribed) | Role (inferred) |
|---|---|
| Speaker (company side) | Runs the office: permits, website admin, booking emails, confirmations, payments check, wages/hours, newsletter. *"This is only the work that I do."* |
| Bruno | Co-owner/boss side; takes market photos (sent via WhatsApp); contacts employees; logistics ❓ |
| Lars | Logistics / stall set-up; owns a separate company that **rents stalls to the company** and sets them up ❓ |
| Frank | Office staff who will also enter phone bookings ❓ |
| Marcos | Did the flyers and the website front end (former friend-of-company) |
| (PHP developer) | Built the website back end; still occasionally helps |

## 1. Guiding principles they stated (adopt as product principles)
1. **Digitise → optimise → automate**, in that order. *"In order to automate anything, all of this has to be digital."*
2. **Internal first.** Don't change what vendors see (website, booking form, emails) until the internal
   system works. *"Everything runs from the outside the same. It's just how you process it inside is different."*
3. **Step-by-step rollout, sandbox first, nothing hidden.** Staff know the current tools; change slowly;
   don't hide existing functions behind menus at the start.
4. **Human touch stays.** One-to-one communication (phone, personal emails, talking to vendors on market
   day) is their strength (*"our strong suit"*). Automate labour, not relationships.
5. **No AI in the product at first.** AI is used to *build* it, not to run it. Later, AI may *prepare*
   things (e.g. parse a free-text booking email into a draft), but a human always confirms and sees the
   original. *"I wouldn't give 'Jesus take the wheel' to an AI."*
6. **Staff live on WhatsApp.** Field staff only use WhatsApp. Notifications must reach them there.

## 2. The business
- **Event types** (current mix ❓ roughly, of ~20 market series/dates per season): **flea markets**
  (main, stable income, most events), **antique markets** (bought a portfolio from another organiser;
  "old and dying"; being reworked into **antique/design**), **design markets**, **food & wine**
  (pure gastronomy, profitable, to be pushed next year), **Stadtfest** (city festival, ~0.5 per year,
  being reduced: "too much hazard, too little reward"), **theme markets** with programme (green programme,
  workshops, police information stands), and **new event formats** they want to add: workshops, a
  **volleyball tournament** (teams register and pay a fee, tents for rent, food and party; research
  trip to a Dutch event planned).
- **Rules per type:** flea markets allow ~30% new goods (handmade yes; batteries/phone cases never).
  Antique = fully antique. Food vendors **cannot book online**; numbers are limited; mostly **yearly
  bookings**.
- **Naming matters for permits:** the city no longer grants new *flea market* permits, so new formats
  are framed as design/lifestyle markets.
- **Strategy:** attract **younger vendors and visitors** (design, handmade); regulars (mostly antique)
  are "dying out"; social media is weak and will become a focus.
- Up to **4 markets on one weekend** today; growth expected once the system takes stress off.
- **Sister company** markets are also listed on their website (entered manually).

## 3. Terminology: the "3 Vs"
They insisted on consistent words: **Vendor** (Händler/Aussteller, rents a stall) vs **Visitor**
(Besucher, comes to the market). **Never "customer"**, it's ambiguous. A third "V" was joked about
(❓ "visionaries"). **Product owner confirmed (2026-10-21): just Vendor + Visitor.** Glossary updated.

## 4. Permits: a categorised logbook + "status quo checker"
- Categories they drafted live: **City (Stadt)**: market permit (*"23 of them, depending on the
  location"* ❓), **water** (hydrants/standpipes, city-specific), **signage/posters** (city issues
  **stickers** that must be on every poster in the official signage areas), **no-parking signs**
  (Halteverbot). **External**: **toilets**, **location/landowner OK** (when the ground isn't the city's).
  More will be added.
- **Lead times:** most permits ~**6 months** ahead, some 2 months. *Right now (autumn) they are filing
  next year's applications.*
- **Contested location (river promenade, most likely the Kölner Altstadt flea market: the client is
  `coelln-konzept`):** the city now **collects applications from all organisers,
  allocates months itself and answers in January**. Earlier they applied in November, then moved to June
  to get ahead.
- **Multi-year agreement** for one location (Linz ❓): dates for 4 years fixed at signing (the permit
  itself still separate).
- **The core wish**, in their words: a **company-wide knowledge base / "status quo checker" /
  logbook**. Which permits do we currently hold, for which locations, what's done, what's missing.
  *"When a new market is created, everything that can be populated is already populated and crossed out,
  with links to the documents, and everything missing becomes a to-do list with priorities by how many
  weeks in advance it must be done."*
  → Validates our permit vault + coverage + instantiation design. Add: categories city/external, physical
  deliverables (stickers), fees with **installments**, application windows and expected decision dates.

## 5. A market = project with a timeline
- *"In the end it's a fancy project management kanban board tool, very targeted towards market projects."*
- Create a market (dates, place, type) → known information fills in → the rest becomes a to-do list →
  **delegate by drag & drop onto a person (kanban)** → that person is **notified via WhatsApp**.
- Tasks that aren't finished **carry over** to the next days.
- **Time estimates per task:** *"allocate the time needed… so I know if we hire an employee to do this,
  this is what it takes."* → Estimates in templates; workload per person/role/week; hiring signal.
  (This **reverses** our earlier "counts, not hours" decision.)
- Agreed next step: a **mock-up market timeline workshop** ("market is on the 1st, what happens a week
  before, two weeks before, two months before…") → becomes the first real template.
- Same people do the same jobs where possible → duty roles with default people (validated).

## 6. What constitutes a market (their own breakdown)
Permits · **Booking / payment / reservation / confirmation** (email management) · **Employees / shifts /
delegation** · **Communication**: website, newsletter, flyers (handed out at markets to vendors *and*
visitors), posters (made long before), magazines, social media, "print vs digital" · **Maps** (*"currently
the main way of organising and keeping track of people"*) · **Logistics** (stalls, water, cables,
returns) · **Archive** (paper is kept one year, then thrown away).

## 7. Bookings: how it works today (old PHP website + Outlook)
- Website admin: **market presets** (headline, text, price €15/m) → **dates** assigned to presets, with
  statuses **planned** (published but not bookable: permit not confirmed yet, so vendors can plan),
  bookable, **fully booked**, done. Price per date is redundant ("always €15/m"); it should come from the preset.
- Vendor books on the website (name, metres, free text, multiple dates via checkboxes) → system email to
  Outlook → staff reply using **one Outlook signature per market** (market info + link) = **confirmation**.
  The confirmation/**Platzkarte** serves as receipt. Some vendors (esp. food) need a real **Rechnung**,
  written manually from a Word template, sometimes **in another name**.
- **Proposed in the meeting:** confirmation email includes an auto-generated invoice *if requested*; the
  booking form asks "invoice wanted? name/company on invoice".
- **Payments:** bank transfer; staff check the bank portal **Mon/Wed/Fri**, one by one, mark paid (yellow).
  Paid vendors get no further confirmation (some are unsure). Unpaid after the deadline → removed and notified.
  **Payment reminders must be sent by a person, not automatically**, because bank checks lag (a reminder
  on Tuesday could hit someone who paid Monday). Show unpaid status clearly; automate later only if volume demands it.
- **Legacy "Internet" fee** (€2.50 per booking, from dial-up days) is used to adjust prices without changing
  the per-metre price.
- **Cut-off: the Monday before the event.** Later requests come by phone and are entered by staff →
  **manual entry must be very easy**.
- **Car at stall (Autoplatz):** limited (e.g. one side of each row), sells out early, **linked to the stall**;
  **car length must match the booked length** (a Transit needs 6 m). Today requested in free text. Wishes:
  a per-market **"car spaces sold out" switch** that removes the option; in multi-date bookings
  **per-date metres + car checkbox** with **"copy from previous date"**; confirmation must say **per date**
  whether a car space was granted. Don't over-advertise the option ("everyone will want one").
- **Multi-date requests** should be split into **one request per market**, each landing in that market's
  queue, where staff drag it onto a slot and decide car yes/no.
- **Free-text email requests** stay a service. Later, an AI agent may draft a booking from them
  (missing fields empty, original visible, human confirms).
- **Stall maps** are the central organising tool today. Map view/edit for bookings comes later.

## 8. Money
- **Payables with installments** (e.g. a location fee of €15,000 in instalments) get forgotten → need
  **due-date reminders**, paid/unpaid checklist, a **finance filter** in the dashboard, priority.
- **Market close-out:** did everyone pay, what extra costs arose, **revenue vs costs per market**.
- **Receipts** are on paper; idea: photo upload → attached to the market/expense; the tax advisor gets
  everything anyway. When a permit fee is marked paid it should flow into finances without double entry.
- Possibly a **separate finance tool**, but integrated ("how does it communicate with the finance app?").

## 9. Company tab (beyond markets)
- Recurring **company duties** (taxes via the tax advisor, vehicle costs). **Vehicle maintenance**:
  currently none, wanted (vans are in poor shape).
- **Employees / wages:** mostly **Minijobber**. The office calculates by hand how much each person has
  worked and may still work (to stay under the cap) and must deliver wages **by the 15th of the month**;
  currently a document copied every month. *"This is most of the admin work."* → hours tracking with
  remaining allowance per person.
- **Shifts** must be filled per market.

## 10. Inventory & logistics
- Wanted: inventory of **cables, electric boxes, tables…** and per-market needs → see shortages → rent/buy.
  Start small (cables, electric boxes). **Hydrants/standpipes** are rented from the city per city.
- **Rented items need return reminders** (an employee forgot to return rented water pipes).
- Barcodes/RFID scanners: **explicitly not MVP** ("multiple-month project").
- Stalls are rented from Lars's company (supplier relationship).
- *"Whenever you notice something [in daily work], check if it has its counterpart here."*

## 11. Communication & marketing (mostly later)
- **Newsletter:** everyone who has booked gets it automatically (via Outlook), opt-out via an old web form.
  Some engagement, mostly from new vendors.
- **Flyers** at markets (reach vendors and visitors); **posters & signage** (L-frames) with city stickers;
  magazines; **social media** is the weak spot and the mid-term focus; corporate design overhaul is a
  separate project (by our team).
- **Photos** from markets arrive via WhatsApp → wish for a shared photo library.
- **Website:** separate project, later. But *"when I create a new market, I want it to appear on the website"*
  → marktwerk becomes the source of truth for dates later (public feed), when the website is rebuilt.

## 12. Vendor relations
- **Talking to vendors during markets** (1–2 h per market): feedback, personal relationship.
- Regulars are "family" and follow to new markets (**first market free** as an incentive).
- Mix shift from antique → design/handmade is a strategic goal → worth measuring per market.

## 13. Infrastructure & data
- Hosting worries: *"If the cloud breaks, do they have backups?"* Recommendation in the meeting: cloud
  for the first year (cheap) + **a local copy/backup** on their own server (they have one ❓).
- They want a shared **drive/cloud** for documents (Nextcloud mentioned ❓).
- Paper archive is kept one year, then discarded. Note: invoices/receipts must be kept **8 years** (GoBD),
  so digital retention rules are needed.
- They'll give access to the old website admin; plan: **copy it, never touch production**, extract the
  preset/booking structure and data for migration.

## 14. Explicitly rejected / not now
- **Trash deposit (Müll-Kaution):** tried once; vendors dumped bulky waste. Not doing it.
- **Automatic payment reminders**: not at first.
- **AI running processes**: not at first.
- **Barcode/RFID inventory scanning**: not MVP.
- **Changing the public website/booking form now**: no. Later, slowly.

## 15. Impact summary on our plan (details in roadmap/data model)
| Area | Before | After the meeting |
|---|---|---|
| Phase 1 scope | Tasks, templates, permits, notifications, boss view, KB | **+ kanban drag-to-assign, WhatsApp notifications, time estimates, payables & instalments, permit categories/logbook, market types & presets, staff hours (Minijob)** |
| Task estimates | Counts only | **Estimates in hours; workload & hiring view** |
| Notifications | In-app + email | **WhatsApp first for staff**, email/in-app for office |
| Public booking form | Phase 2 (M5) | **Removed from Phase 2.** Old website stays; marktwerk **ingests** its booking emails/DB. New form with the new website later |
| Bookings | Generic pipeline | **Per-market request queues**, multi-date split, Autoplatz per date + sold-out switch, cut-off Monday, phone entry, manual payment reminders, confirmation + optional invoice in another name |
| Finance | Vendor invoices only | **+ payables with instalments, receipts, per-market P&L, company costs** |
| New modules | — | **Team & shifts (hours, Minijob cap, payroll by 15th), inventory & rentals (light), vehicles, communication checklist, photo library** |
| Event model | Markets only | **Market types incl. non-market events** (workshops, tournaments) |
| AI | Phase 4 assist | Same, strictly human-in-the-loop, clearly optional |
| Hosting | Open | Cloud + local backup copy to their server |
