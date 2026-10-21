# Architecture Decision Records

Short records of decisions that are expensive to reverse. Format: context → decision →
consequences. Statuses: *proposed*, *accepted*, *superseded by NNNN*, *open* (a decision is needed).

| # | Title | Status |
|---|---|---|
| [0001](0001-typescript-monorepo-nextjs-postgres.md) | TypeScript monorepo: Next.js + PostgreSQL + Drizzle | accepted |
| [0002](0002-single-tenant.md) | Single company, no multi-tenancy | accepted |
| [0003](0003-auth-better-auth.md) | Better Auth with fixed permission roles + duty roles | accepted |
| [0004](0004-no-cache-components-cookie-locale.md) | Cache Components off; locale from user profile, not URL | accepted |
| [0005](0005-jobs-pg-boss.md) | Background jobs with pg-boss in a separate worker | accepted |
| [0006](0006-hosting.md) | Production hosting: Scalingo (EU-owned managed PaaS) as candidate | deferred (see 0017) |
| [0007](0007-tooling-versions.md) | Tooling: TypeScript 6, pnpm 10, Biome | accepted |
| [0008](0008-m365-graph.md) | Microsoft 365 via Graph application permissions | proposed |
| [0009](0009-field-cash-handling.md) | Cash handling on market day (KassenSichV) | open |
| [0010](0010-event-entity-types-presets.md) | "Event" (Veranstaltung) is the core entity, with types and presets | accepted |
| [0011](0011-staff-notifications-whatsapp.md) | Staff notifications via WhatsApp (Phase 2): wa.me links first, Cloud API later | accepted |
| [0012](0012-staff-members-vs-users.md) | Staff members are separate from login users | accepted |
| [0013](0013-legacy-website-bridge.md) | The old website stays; marktwerk ingests its bookings | proposed |
| [0014](0014-no-ai-in-operations.md) | No AI in operational decisions; human-confirmed drafts only | accepted |
| [0015](0015-finance-operational-layer.md) | Finance: operational layer; the tax advisor keeps the books | accepted |
| [0016](0016-synthetic-development-data.md) | Synthetic, deterministic data for development | accepted |
| [0017](0017-development-hosting.md) | Development hosting on free tiers (Vercel + Supabase) | accepted |
| [0018](0018-workspace-architecture.md) | Customisable workspace: docking shell, view registry, server-side layouts | superseded by 0019 |
| [0019](0019-classic-screens.md) | Classic screens instead of a customisable workspace | accepted |
| [0020](0020-board-drag-and-drop.md) | Board drag and drop with dnd-kit (pointer/touch); keyboard mode stays our own | accepted |
