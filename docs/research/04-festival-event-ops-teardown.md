# Research 04 — Festival & event production tools

*The client sees these tools as the closest analogue. Evidence levels: **[V]** confirmed from vendor
pages or search snippets; **[K]** background knowledge, to be confirmed in a demo. Vendor pages
couldn't be opened directly from our research environment, and the search budget ran out, so
the [K] items need checking.*

## Products

### Crescat (Norway): closest information architecture [V]
- Organization → products (Event / Venue / Festival) → events → rooms, festival sections (departments),
  shifts, timeline, documents, checklists, **metadata (typed custom fields)**.
- **Event Types are the template system:** booking an event pre-fills schedule, day sheets, documents,
  shifts and checklists "in a few clicks".
- **Event duplication** for recurring editions, incl. metadata fields.
- **Day sheets** generated from the timeline, downloadable for one event or a date range.
- **Shift Market:** crew claim or swap open shifts themselves. Timed accreditation (valid only in a window).
- Mobile app; no evidence it works offline. From ~NOK 1,390/mo.

### Lennd (US): external parties via portals [V]
- Org CRM → events → groups (vendors, partners, departments) → **portal per group** → forms and
  **file requests with due dates and a sample file** → approvals (single to multi-level) → issuance, check-in.
- External parties see what's approved, denied and still due. "One place for the advance."
- Heavy CRM, built for big festivals.

### OnePlan (UK): site plans on real maps [V]
- Browser GIS (Esri), satellite base, cm-accurate; import PNG/floor plan as a layer; object library
  (barriers, toilets, booths) with **automatic lengths/areas**.
- Exports up to A0, **Bill of Quantities** CSV (fencing, toilets…), object CSV.
- **View-only share link for local authorities**, suppliers, vendors.
- Permit-ready vendor layout: to scale, numbered booths with trading name and licence status matching
  the roster, fire lanes, cooking setbacks, accessible toilets, waste, emergency access.
- Admits it has no task/timeline layer. That gap is exactly where marktwerk sits.

### FestivalPro (UK): trader management [V]
- Vendor record: pitch size, power, vehicles, pitch fee, deposits, H&S documents, invoices; vendor
  logs in to upload certificates; **advance form** captures pitch size and power; invoices from forms.
- Process: promote pitches → sift applications → **fee by size and location** → confirm in writing → send pitch specs.
- £45–249/mo, % on ticketing; dated UI [K].

### Others [K]
- **Run-of-show (Shoflo, Rundown Studio, Cuez, Stagetimer):** rows with time, owner and status;
  live mode highlights the current row; crew views by link. Only the "timeline with owner + status"
  idea transfers (market day 05:00–18:00 as a soft-timed rundown).
- **Master Tour / Daysheet:** the **day sheet** as a generated, offline-cached snapshot (address,
  gate code, arrival times, contacts, plan, documents). Master Tour's offline sync is its known strength.
- **Event control logs (UK practice):** append-only, timestamped entries (corrections are new entries);
  category, priority, location, reporter, assignee, status, photos; separate decision log; end-of-event report.
- **Connecteam:** field-staff app: shifts, checklists with photo/signature, GPS time clock, chat,
  offline forms. The best "6 am crew" reference.
- **Deputy / When I Work / Rosterfy:** open shifts, swap with approval, availability, time clock.
- **Vectorworks Spotlight:** concept of **layers by trade** (power, infrastructure, vendors, safety).
- **German Volksfest/municipal practice:** Ausschreibung with Bewerbungsfrist → Bewerbung (assortment,
  front metres, depth, power, photos, documents) → Zulassung by published criteria + Branchenmix quotas
  with documented reasons → Platzvergabe on Lageplan → Gebühren → Aufbau inspection.

## Cross-product patterns
1. **Template = event type, instantiated per date** (Crescat).
2. **Departments as a scoping unit** with default permissions (Crescat sections).
3. **External party = portal + due-dated requests + visible status** (Lennd).
4. **Application/advance form → record → invoice** (FestivalPro).
5. **Day sheet = generated snapshot**, offline is the differentiator.
6. **Map objects carry data** (booth number ↔ roster, licence status), auto-measure, quantity list,
   view-only link for authorities (OnePlan).
7. **Append-only incident log.**
8. **Self-service shifts with approval.**
9. **Typed custom fields** instead of hard-coding every field.

## Adopted into our plan
| Pattern | Phase | marktwerk version |
|---|---|---|
| Event types / templates | 1 | Checklist templates attached per venue/series; "copy from last market"; "update template from this market" |
| **Series → bulk generate markets** | 1 | Pick series + dates in a calendar → generate N markets with tasks and permits (gap in every festival tool) |
| Typed custom fields | 1 | `custom_fields` jsonb on venue/market, with field definitions in settings (gate code, landlord…) |
| Departments | 1 | Duty roles (Marktleitung, Aufbau, Büro, Genehmigungen) as task placeholders + filters |
| Date-range day sheet / dashboard | 1 | Boss view: next 14 days of markets as rows, traffic light per area |
| "Awaiting external" status | 1 | Task status `waiting_external` |
| Advance form → invoice | 2 | Vendor application: metres, depth, category, power, car (+ car length) |
| Fee by size **and location** | 2 | Price rules per metre × zone + add-ons |
| Portal with file requests | 2–3 | Vendor magic-link page: bookings, document uploads with expiry, invoices |
| Admission criteria + Branchenmix | 2 | Category caps, accept/decline with reason templates |
| Offline day sheet | 3 | Field PWA caches today's market: address, gate code, contacts, rundown, stall list, permit PDFs |
| Soft-timed rundown | 3 | Market-day timeline (05:30 barriers, 06:00 arrival, 08:00 opening…) tap to mark done |
| Photo-evidence checklists | 1 → 3 | Evidence rules in Phase 1; offline photo queue in Phase 3 |
| Map with data, layers, authority link | 3 | Rows drawn on venue image, layers (stalls / infrastructure / escape routes), PDF + view-only link, quantity list |
| Append-only incident log | 3 | "Vorfallbuch" per market with PDF export |
| Shift claiming | 4 | Crew claim open market-day slots |

## Traps (overbuilding like festival tools)
1. Optimising for a few huge events. We have up to 150 small, near-identical ones, so optimise for **instantiating and tracking many**.
2. Credential/accreditation engines: we need only "is this vendor booked here today?".
3. Artist advancing, hospitality, guest lists: irrelevant.
4. Second-precise run-of-show: soft times suffice.
5. Full CAD/GIS editor: image background + rows with metre labels is enough.
6. Module sprawl with a shallow UI: **one market page with tabs**.
7. Heavy external-user CRM: vendors get **magic links**, not accounts.
8. Online-only field tools: offline is non-negotiable, but as a **read-mostly snapshot + append-only outbox**, not full offline editing.
9. Per-module permission matrices: 4 roles + duty roles are enough for 5–20 people.
10. One-way templates: allow pushing lessons from a market **back** into its template.

## Hands-on demo shortlist (recommended)
1. **Crescat**: event types, duplication, day sheets, mobile without signal.
2. **OnePlan**: Phase 3 map reference; ask about recurring sites with per-date variations.
3. **Lennd**: vendor portal / file-request / approval patterns.
4. **Connecteam** (free small-team plan [K]): field crew UX; test in airplane mode.
5. **Marketspread** (from research 02): Scheduler grid, double bookings, draft/release invoices.
6. A German market tool (**Marktmeister Pro** or **VOIS|MARKT**): native German application → admission → allocation → fees.
