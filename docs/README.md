# marktwerk documentation

Start here: **[HANDOFF.md](HANDOFF.md)** (how we work, gotchas), then **[product/vision.md](product/vision.md)** → **[product/roadmap.md](product/roadmap.md)**.
Current steps and progress: the **Marktwerk Fahrplan** tracker (https://claude.ai/artifact/Ei3Xy9VGSDWr5WsEujn639), the source of truth for what is done and what is next.
Historical documents (finished plans, finished research and review records, early prompts, the Claude Design
prototype, wireframes, component inventory): [archive/](archive/README.md), not maintained.

## Product
- [Vision & scope](product/vision.md): goals, non-goals, success metrics
- [Roadmap](product/roadmap.md): phases and milestones from MVP to full platform, with inspiration per feature
- [Roles & personas](product/roles-and-personas.md)
- [User flows](product/user-flows.md): Mermaid diagrams of the core lifecycles
- **[UX concept](product/ux-concept.md)** (v2): principles, IA, app shell, pages/Vorschau/drawers, patterns, status vocabulary, visual system (§9 = tokens in `globals.css`)
- [Glossary DE ⇄ EN ⇄ code](product/glossary.md)

## Research
- [01 Market landscape, German domain rules, payments](research/01-market-and-domain.md)
- [02 Market & vendor-booking tools teardown](research/02-market-booking-teardown.md)
- [03 Task, checklist, compliance & shared-inbox tools teardown](research/03-ops-tasks-inbox-teardown.md)
- **[05 Client meeting, October 2026: workflows, pain points, wishes](research/05-client-meeting-2026-10.md)** ← most important input
- [06 Staff: WhatsApp notifications, shifts & Minijob hours, kanban](research/06-staff-whatsapp-shifts-kanban.md)
- [07 Inventory & rentals, payables & receipts, event P&L, vehicles](research/07-inventory-finance-fleet.md)
- [08 Booking intake, confirmations/invoices, payment checks, newsletter, marketing](research/08-bookings-comms-newsletter.md)
- **[13 The client's own checklists and wall calendar (November 2026)](research/13-client-checklists-and-wall-calendar.md)**: source for the Vorlagen, market dates and the synthetic data

Archived research records ([archive/research/](archive/README.md)): 04 festival & event production tools, 09 UI/UX
standards and references, 10 UX review (October 2026), 11 user test (November 2026, UT-xx), 12 user test 2
(2026-11-13, UT2-xx).

## UX audit
- [UX audit](ux-audit/README.md): method and the reusable frameworks F1–F3; round 1 (2026-11-13) is archived

## Architecture
- [Overview](architecture/overview.md): system context, code layout, cross-cutting concerns, M365 integration, environments
- [Data model](architecture/data-model.md): entities, ERD, key algorithms
- [ADRs](architecture/adr/README.md)

## Development
- [Setup](development/setup.md)
- [Conventions](development/conventions.md)
- [Testing](development/testing.md): unit, integration and e2e tests
- [Release routine](development/release.md): how a change reaches the deployed dev app (ADR 0023)
- [Deployment](development/deployment.md): dev on Vercel + Supabase (ADR 0017), branch environments on Neon (ADR 0023); Scalingo is the production candidate (ADR 0006, deferred)
- [Synthetic data](../packages/synthetic/README.md): what the seeded development dataset contains (ADR 0016)

## [Open questions & decisions log](open-questions.md)
