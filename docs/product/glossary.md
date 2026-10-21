# Glossary (DE ⇄ EN ⇄ code)

The business runs in German, the codebase is in English. This table maps the words staff use,
the words in the UI and the identifiers in code. **Add a row before introducing a new domain term.**

**Words we never use:** "customer"/"Kunde". It's ambiguous. A **vendor** rents a stall; a **visitor**
comes to the event (client's explicit rule, research 05).

## People
| German (UI-DE) | English (UI-EN) | Code | Meaning |
|---|---|---|---|
| Händler / Aussteller | Vendor | `vendor` | Rents a stall at an event. Private or commercial. |
| Besucher | Visitor | `visitor` | Comes to an event. Only relevant for communication (flyers, newsletter, social). |
| Stammhändler | Regular vendor | `vendor.is_regular` | Comes repeatedly, "family"; follows to new events. |
| Stammplatz | Usual spot | `regular_spot` | Preferred stall of a regular, a *preference*, not a right. |
| Mitarbeiter:in | Staff member | `staff_member` | A person who works for the company (office or field). May have no login. |
| Benutzer:in | User | `user` | Someone with a marktwerk login (linked to a staff member). |
| Minijobber:in | Mini-jobber | `contract_type = minijob` | Employee under the Minijob earnings limit. |
| Geschäftsführung | Owner | `role: owner` | Permission role. |
| Büroleitung | Office manager | `role: manager` | Permission role. Receives escalations. |
| Platzteam | Field crew | `role: field` / staff without login | Works on event days; reached via WhatsApp. |
| Zuständigkeit (z. B. Marktleitung, Aufbau, Büro, Genehmigungen, Kasse) | Duty role | `duty_role` | What someone is responsible for at an event; template placeholder. |
| Behörde / Amt | Authority | `contact.kind = authority` | e.g. Ordnungsamt, Amt für Straßen und Verkehr. |
| Grundstückseigentümer / Vermieter | Landowner / landlord | `contact.kind = landowner` | Gives the "OK" when the ground isn't the city's. |
| Lieferant | Supplier | `contact.kind = supplier` | Toilets, stalls (incl. Lars's stall company), water utility… |

## Events
| German (UI-DE) | English (UI-EN) | Code | Meaning |
|---|---|---|---|
| Veranstaltung | Event | `event` | **Core record**: one occurrence (date or date range) of a market or other format. Menus may say "Märkte" where natural. |
| Veranstaltungsart | Event type | `event_type` | Current scope: **Flohmarkt** (`flea`), **Antikmarkt** (`antique`), **Stadtfest** (`city_festival`), **Food & Wine** (`food_wine`). Future: Designmarkt, Workshop, Turnier. Carries rules (new-goods share, online booking allowed). |
| Veranstaltungsvorlage (im alten System: "Preset") | Event preset | `event_preset` | Blueprint for a recurring event at a location: type, texts, prices, templates, permit needs, equipment needs, default team. Optional recurrence. |
| Termin | Date / occurrence | `event.starts_on` | The old website calls each event date a "Termin". |
| Ort / Veranstaltungsort / Gelände | Location / venue | `venue` | Physical place (square, promenade, car park, hall). |
| Zone / Reihe | Zone / row | `zone`, `row` | Area of a venue; rows have a length in metres. |
| Standplatz | Stall | `stall` / placement | Position of a vendor at an event (metre interval on a row). |
| laufender Meter (lfm) | Linear metre | `length_cm` | Frontage length; main pricing unit (€15/m standard). |
| Autoplatz / PKW am Stand | Car at stall | `car_requested`, `car_granted` | Vehicle behind the stall. Limited; car length must not exceed booked length (Transit → 6 m). |
| Autoplätze ausgebucht | Car spaces sold out | `event.car_spaces_full` | Switch that removes the car option. |
| Buchungsschluss | Booking cut-off | anchor `booking_cutoff` | Default: Monday before the event. |
| geplant (öffentlich, nicht buchbar) | Planned / announced | `event.status = planned` | Published so vendors can plan; permit not confirmed yet. |
| buchbar / ausgebucht | Bookable / fully booked | `event.booking_state` | Booking flags, separate from lifecycle status. |
| Schwesterfirma-Termine | Sister-company dates | `external_listing` (Phase 4) | Third-party dates shown on the website. |
| Rahmenvertrag / Mehrjahresvereinbarung | Multi-year agreement | `location_agreement` | e.g. 4-year contract with fixed dates. |

## Permits ("Genehmigungen") and the logbook
| German (UI-DE) | English (UI-EN) | Code | Meaning |
|---|---|---|---|
| Genehmigung | Permit | `permit` | Any authorisation an event needs. |
| Kategorie Stadt / Extern | City / external | `permit.category` | Client's own split: city permits vs. external OKs. |
| Marktgenehmigung (Sondernutzung, §69 Festsetzung…) | Market permit | `permit_type = market_permit` | The core city permit for the event. |
| Wasser / Hydrant / Standrohr | Water / standpipe | `permit_type = water` + `rental` | Hydrant use; standpipes rented from the city utility. |
| Plakatierung (mit Aufklebern/Plaketten) | Poster/signage permit (with stickers) | `permit_type = signage` | City issues stickers that must be on each poster. |
| Halteverbot | No-parking order | `permit_type = no_parking` | Temporary no-parking signs. |
| Toiletten | Toilets | `permit_type = toilets` | External. |
| Einverständnis Grundstück | Landowner OK | `permit_type = landowner_ok` | External. |
| Bestandsübersicht / Logbuch | Status quo / logbook | logbook view | Company-wide: what we hold, for which location, what's missing. |
| Antragsfenster / Entscheidung erwartet | Application window / expected decision | `submission_window_*`, `expected_decision_on` | e.g. city collects all applications, decides in January. |
| Auflagen | Conditions | `permit.conditions` | Turned into tasks. |
| Frist / Vorlaufzeit | Deadline / lead time | `due_at` / `lead_time_days` | |

## Interface
| German (UI-DE) | English (UI-EN) | Code | Meaning |
|---|---|---|---|
| Übersicht | Overview | route `/` | Start screen, the same for everyone: KPIs, season strip, Heute fällig, Nächstes Wochenende. |
| Kalender (Ebenen) | Calendar (layers) | route `/kalender`, `user_preference.saved_views` | Company-wide calendar; layers (events by type, deadlines, shifts, holidays) switched on per person. |
| Vorschau | Preview | `?vorschau=<type>:<id>` | Small read-only card for a list row (👁 or Space); Enter opens the page, Esc closes. |
| Drawer (Detailansicht) | Detail drawer | `?detail=<type>:<id>` | Panel from the right for real work on one record (task, permit, payable) while the list stays visible. |
| Dichte: Standard / Kompakt | Density: standard / compact | `user_preference.density` | 40 px vs 32 px rows; per person. |
| Design: System / Hell / Dunkel | Theme: system / light / dark | `user_preference.theme` | |
| Befehlspalette (Strg+K) | Command palette | — | Search and commands; opened from the search field or Strg+K / Ctrl+K. |

## Work
| German (UI-DE) | English (UI-EN) | Code | Meaning |
|---|---|---|---|
| Aufgabe | Task | `task` | |
| Checkliste / Ablauf | Checklist / timeline | `checklist` | Tasks from a template for one event. |
| Vorlage (Ablaufvorlage) | Template | `checklist_template` | Versioned; published deliberately. |
| Vorbereitung / Durchführung / Nachbereitung | Before / During / After | `phase: pre \| live \| post` | |
| T-30 | T-minus 30 days | `offset_days = -30` | Relative to an anchor date. |
| Zeitaufwand (geschätzt) | Estimated effort | `estimate_minutes` | Per task/template item; drives workload & hiring view. |
| Board / Kanban | Board | board view | Drag tasks onto people to assign. |
| Übertrag (↻) | Carry-over | `rollover_count` | Unfinished overdue task moved to "today". |
| Schicht | Shift | `shift` | A staff member working an event in a role, with planned/actual times. |
| Stundenzettel / Arbeitszeit | Timesheet / working time | `shift.actual_*` | §17 MiLoG: record within 7 days. |
| Monatsabschluss Stunden | Monthly hours close | `payroll_period` | Hours to the payroll office by the 15th. |
| Standgespräch | Vendor talk | `vendor_note.kind = talk` | 1–2 h per event talking to vendors; their strong suit. |

## Money
| German (UI-DE) | English (UI-EN) | Code | Meaning |
|---|---|---|---|
| Standgebühr | Stall fee | `fee` | |
| Online-/Buchungsgebühr (alt: "Internet") | Booking fee | `booking_fee_cents` | Legacy €2.50 "Internet" fee. |
| Platzkarte | Stall ticket | `stall_ticket` | Confirmation document; designed to double as a *Kleinbetragsrechnung*. |
| Rechnung (ggf. abweichender Empfänger) | Invoice (optional other recipient) | `invoice`, `invoice_recipient` | On request; immutable once issued. |
| Stornorechnung | Cancellation invoice | `invoice.kind = cancellation` | |
| Zahlungseingang prüfen | Payment check session | `payment_check` | Mon/Wed/Fri routine. |
| Zahlungserinnerung (manuell) | Payment reminder (manual) | `reminder` | A person presses send. |
| Verbindlichkeit / Zahlung an Dritte | Payable | `payable` | Money *we* owe (location fee, permit fee, rentals). |
| Rate | Instalment | `installment` | Part payment with its own due date. |
| Ausgabe / Beleg | Expense / receipt | `expense`, `document` | Receipt photo is evidence, not the transaction. |
| Abschluss (Veranstaltung) | Event close-out | `event.status = closed` | P&L: plan → committed → actual. |
| Steuerberater | Tax advisor | — | Does the books; we export to them. |

## Company & resources
| German (UI-DE) | English (UI-EN) | Code | Meaning |
|---|---|---|---|
| Firma (Bereich) | Company (area) | company tab | Everything not tied to one event. |
| Pflichttermin / wiederkehrende Pflicht | Recurring obligation | `obligation` | e.g. HU/TÜV, UVV inspection, insurance renewal, KSK report. |
| Fahrzeug | Vehicle | `vehicle` | Vans; HU every 24 months (≤ 3.5 t), UVV yearly. |
| Inventar / Material | Inventory / equipment | `item_type` | Bulk items: cables, power boxes, tables… |
| Bedarf | Requirement | `event_requirement` | What an event needs. |
| Engpass | Shortage | computed | Requirement > available. |
| Anmietung / Rückgabe bis | Rental / return by | `rental.due_return_on` | e.g. standpipes from the utility; deposit, late fee, meter readings. |
| Wissensdatenbank | Knowledge base | `kb_article` | |
| Postfach | Mailbox | `mailbox` | Connected Microsoft 365 mailbox. |
