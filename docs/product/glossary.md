# Glossary (DE ⇄ EN ⇄ code)

The business runs in German, the codebase is in English. This table is the single
mapping between the words staff use, the words in the UI, and the identifiers in code.
**Add a row before introducing a new domain term in code.**

| German (business / UI-DE) | English (UI-EN) | Code identifier | Meaning |
|---|---|---|---|
| Veranstalter | Organizer | `organization` (settings only) | The company operating the markets. Single company, so there is no tenant table. |
| Veranstaltungsort / Marktgelände | Venue | `venue` | A physical location (square, car park, hall). Long-lived; the *blueprint* for markets held there. |
| Markt / Markttermin | Market (date) | `market` | One concrete market on one date (or date range) at one venue. An *instance* created from a venue + templates. |
| Marktserie | Market series | `market_series` | A recurrence rule ("every 1st Sunday, Apr–Oct") that generates `market` rows. |
| Zone / Reihe | Zone / Row | `zone` | A named area of a venue with a capacity in metres (or a number of fixed slots). |
| Standplatz | Stall / Pitch | `stall` (`slot` when fixed-size) | A position a vendor occupies at a market. |
| laufender Meter (lfm) | Linear metre | `length_m` | Frontage length a vendor books; the main pricing unit. |
| Standgebühr / Standgeld | Stall fee | `fee` | Price charged for a stall. |
| PKW am Stand | Car at stall | `addon: car_at_stall` | Vendor keeps their vehicle behind the stall; needs more depth, costs extra. |
| Eckplatz | Corner pitch | `addon: corner` | Premium position. |
| Stromanschluss | Power hookup | `addon: power` | Electricity at the stall. |
| Händler / Aussteller | Vendor / Exhibitor | `vendor` | A person or business that rents stalls. |
| Stammhändler | Regular vendor | `vendor.is_regular` | Vendor who comes repeatedly and has a usual spot. |
| Stammplatz | Usual spot | `regular_spot` | The default stall a regular gets offered for each market. |
| Privatverkäufer / Gewerblicher Händler | Private / Commercial seller | `vendor.kind` | Matters for permits, pricing and invoicing. |
| Buchung / Anmeldung | Booking / Application | `booking` | A vendor's request for a stall at a market. Has a status lifecycle. |
| Warteliste | Waiting list | `booking.status = waitlisted` | |
| Rechnung | Invoice | `invoice` | GoBD-relevant; immutable once issued, corrected only via `Stornorechnung`. |
| Stornorechnung / Gutschrift | Cancellation invoice / Credit note | `invoice.kind = cancellation` | |
| Tageskasse | Day cash desk | `cash_session` | Cash collected on market day (walk-ups, add-ons). |
| Laufkundschaft-Händler / Spontanhändler | Walk-up vendor | `booking.source = walk_up` | Vendor arriving on the day without a booking. |
| Genehmigung / Erlaubnis | Permit | `permit` | Any authorisation the market needs (see below). |
| Sondernutzungserlaubnis | Special-use permit (public road) | `permit.type = special_use` | Required to use public ground. |
| Marktfestsetzung (§ 69 GewO) | Market designation | `permit.type = market_designation` | Official designation of a market by the authority. |
| Verkehrsrechtliche Anordnung | Traffic order | `permit.type = traffic_order` | Road closure / signage order. |
| Ordnungsamt | Public order office | `authority` | Typical issuing authority. |
| Frist | Deadline | `deadline` / `due_at` | |
| Vorlaufzeit | Lead time | `lead_time_days` | How many days before the market something must happen. |
| Checkliste | Checklist | `checklist` | An ordered list of tasks grouped by phase. |
| Vorlage | Template | `*_template` | Reusable definition (checklist template, price list template…). |
| Aufbau / Abbau | Set-up / Tear-down | `phase` values | Market-day phases. |
| Vorbereitung / Durchführung / Nachbereitung | Before / During / After | `phase: pre \| live \| post` | Checklist phases. |
| T-30 | T-minus 30 days | `offset_days = -30` | Relative date to the market day. |
| Wissensdatenbank | Knowledge base | `kb_article` | Internal wiki. |
| Mitarbeiter | Staff member | `user` | Someone who logs into the back office or field app. |
| Chef / Geschäftsführung | Owner / Boss | `role: owner` | |
| Postfach | Mailbox | `mailbox` | A connected Microsoft 365 mailbox (e.g. `buchung@…`). |
