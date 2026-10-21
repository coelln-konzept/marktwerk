# Vision & scope

## One sentence
marktwerk is the internal operating system of one German event company (flea, antique/design, design,
food & wine markets and new event formats). Every event, task, deadline, permit, shift, payment and
booking lives in one place, so nothing slips and the team can take on more events without more stress.

## Context
- **Client:** one company (single tenant), Cologne area. Today mainly a **flea market and antique market**
  organiser, with some **Stadtfeste** and **Food & Wine** markets. Several locations and cities, up to **4 events on
  one weekend**, growing. New formats (design markets, workshops, tournaments) are future plans, not current scope.
- **Team:** a small office (one person carries permits, website, bookings, payments, wages) plus field crew,
  mostly **Minijobber**, who **only use WhatsApp**.
- **Today:** an old PHP website with presets, dates and the booking form; Outlook (Microsoft 365) with one
  signature per market as booking confirmation; bank portal checked by hand; paper and Word documents;
  stall maps as the central organising tool; paper archive kept one year.
- **Biggest pain (client's choice):** tasks, checklists and deadlines. Plus, from the meeting: forgotten
  instalment payments, the monthly Minijob-hours calculation, permit status nobody can see at a glance.

## Product principles (from the client meeting)
1. **Digitise → optimise → automate.** First get everything into the system as it is, then improve
   the process, then automate.
2. **Internal first.** Vendors see no change until the internal side works. The old website and booking
   form stay; marktwerk processes what comes in.
3. **Step by step, sandbox first, nothing hidden.** Introduce features gradually; don't remove familiar paths early.
4. **Human touch stays.** Phone calls, personal emails and talking to vendors on market day are strengths.
   We automate labour, not relationships. Payment reminders are sent by a person.
5. **No AI running the business.** AI may prepare drafts later (e.g. parse a free-text booking email); a person
   always confirms and can see the original.
6. **Meet staff where they are: WhatsApp** (Phase 2). No app install required for field crew. In Phase 1 the
   office tracks field crew tasks and hours on their behalf.
7. **Everything that happens has a counterpart in the system.** If something got forgotten, there should be a
   place where it would have been visible.

## Goals (in priority order)
1. **Nothing slips:** tasks, permits, instalments, rentals and obligations are generated, assigned and escalated.
2. **One place to look:** company-wide logbook (permits held, equipment, contracts) plus one page per event.
3. **The boss sees today's priorities in seconds:** ranked "due today" list, finance filter, event health.
4. **Admin work shrinks:** Minijob hours, payroll prep, confirmations and invoices take minutes, not evenings.
5. **Know the cost of an event:** estimated work hours (hiring signal) and money in/out per event.
6. **Bookings flow internally** without retyping (Phase 2), and later to the outside world (Phase 4).

## Non-goals (for now)
- Multi-tenant SaaS.
- Replacing the public website or booking form before the internal system works (Phase 4, together with the
  corporate-design and website project).
- Bookkeeping: the tax advisor keeps the books; marktwerk is the operational layer and exports to them.
- A native app; staff get WhatsApp + magic links, office uses the browser.
- Barcode/RFID inventory, automatic payment reminders, autonomous AI.
- New event formats (design markets, workshops, tournaments) before Phase 4.

## Success metrics (baseline in discovery, measured after 3 months)
| Metric | Target |
|---|---|
| Event-related tasks tracked in marktwerk | > 90% |
| Permits applied late / missed | 0 |
| Instalments paid late (reminded by the payee) | 0 |
| Rented items returned late | 0 |
| Time to prepare monthly Minijob hours for payroll | < 30 min (from "most of the admin work") |
| §17 MiLoG records completed within 7 days | 100% |
| Owner can answer "what's due today and is next weekend OK?" | < 1 minute |
| (P2) Booking confirmations sent same day | > 90% |

## Languages
UI in **German (primary) and English**, per user. Vendor-facing documents default to German.
Domain terms follow [`glossary.md`](./glossary.md).
