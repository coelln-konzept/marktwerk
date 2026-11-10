# marktwerk documentation

Start here: **[HANDOFF.md](HANDOFF.md)** (current state & next steps), then **[product/vision.md](product/vision.md)** → **[product/roadmap.md](product/roadmap.md)**.
Design output: [design/claude-design/](design/claude-design/README.md) → [a-classic/](design/claude-design/a-classic/INDEX.md) (clickable prototype, direction A, ADR 0019; historical reference, the UX concept and the code win).
Historical documents (finished plans, early prompts, wireframes, component inventory): [archive/](archive/README.md), not maintained.

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
- [04 Festival & event production tools teardown](research/04-festival-event-ops-teardown.md)
- **[05 Client meeting, October 2026: workflows, pain points, wishes](research/05-client-meeting-2026-10.md)** ← most important input
- [06 Staff: WhatsApp notifications, shifts & Minijob hours, kanban](research/06-staff-whatsapp-shifts-kanban.md)
- [07 Inventory & rentals, payables & receipts, event P&L, vehicles](research/07-inventory-finance-fleet.md)
- [08 Booking intake, confirmations/invoices, payment checks, newsletter, marketing](research/08-bookings-comms-newsletter.md)
- [09 UI/UX: standards and references](research/09-ui-ux-workspace.md) (its workspace half is superseded by ADR 0019)
- [10 UX/UI review and industry comparison (October 2026)](research/10-ux-review-2026-10.md)
- **[11 User test, November 2026: findings, tasks (UT-xx), open decisions](research/11-user-test-2026-11.md)**

## Architecture
- [Overview](architecture/overview.md): system context, code layout, cross-cutting concerns, M365 integration, hosting options
- [Data model](architecture/data-model.md): entities, ERD, key algorithms
- [ADRs](architecture/adr/README.md)

## Development
- [Setup](development/setup.md)
- [Conventions](development/conventions.md)
- [Testing](development/testing.md): unit, integration and e2e tests
- [Test environment](development/test-environment.md): staging, branch environments, simulated clock, scenarios (ADR 0021, proposed)
- [Deployment](development/deployment.md): dev on Vercel + Supabase (ADR 0017); Scalingo is the production candidate (ADR 0006)

## [Open questions & decisions log](open-questions.md)
