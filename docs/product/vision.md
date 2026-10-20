# Vision & scope

## One sentence
marktwerk is the operating system for one German flea-market company. It holds every market
date, task, deadline, permit, vendor, booking, email and euro, so nothing slips and nobody has
to ask "where is that?".

## Context
- **Client:** one company (single tenant), Germany, running **30–150 markets per year** across
  several venues, with a 5–20 person team (office + market-day crew) and roughly 1,000–5,000 vendors.
- **Today:** spreadsheets, a Microsoft 365 mailbox, WhatsApp, paper checklists, PDF permits in
  folders, bank transfers matched by hand, and a cash box on the day.
- **Biggest pain (client's choice for MVP):** *tasks, checklists and deadlines.* Things get
  forgotten, nobody sees who is doing what, and permit deadlines slip.

## Goals (in priority order)
1. **Nothing slips.** Every recurring piece of work and every permit deadline is generated
   automatically per market, assigned to someone, and escalated before it's late.
2. **One place to look.** Venues, permits, documents, know-how, vendors, bookings and email
   live in one system with links between them.
3. **The boss sees everything in 10 seconds.** Traffic-light overview per upcoming market.
4. **Less retyping.** Bookings and emails become structured data once and flow into allocation,
   invoices and market-day lists.
5. **Market day works in the rain.** Phone-first, offline-tolerant field mode.

## Non-goals (for now)
- Multi-tenant SaaS, self-signup, white-labelling (single company, by decision).
- A full accounting system: we issue invoices and export; bookkeeping stays with the tax advisor.
- A native app-store app: the field app is a PWA unless Phase 3 proves that insufficient.
- A general-purpose email client: we handle the company's business mailboxes, not personal mail.
- Ticketing for visitors.

## Success metrics (measured against a baseline taken in discovery)
| Metric | Target after 3 months of use |
|---|---|
| Market-related tasks tracked in marktwerk (vs. elsewhere) | > 90% |
| Overdue critical tasks at T-7 | ≈ 0 |
| Permits missed or applied late | 0 |
| Time for the owner to answer "are we ready for Sunday?" | < 1 minute |
| (Phase 2) Booking emails answered within 24 h | > 90% |
| (Phase 2) Manual retyping of booking data | eliminated for web-form bookings |

## Languages
UI in **German (primary) and English**, chosen per user. Domain terms follow
[`glossary.md`](./glossary.md). Vendor-facing pages and emails default to German.
