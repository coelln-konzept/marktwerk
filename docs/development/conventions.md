# Conventions

## Language
- Code, identifiers, commits, code comments: **English**. UI strings: in `apps/web/messages/{de,en}.json`, never inline.
- Domain terms map through the [glossary](../product/glossary.md). Add a row before introducing a new term.

## Structure & layering
- Pages/components → server actions / route handlers → services (`src/server/services/*`) → db.
- **Every** server action, route handler and protected page starts with `requireUser()` or
  `requirePermission(resource, action)`. UI checks are cosmetic only.
- Business mutations go through a service that (1) checks permission, (2) runs in a transaction,
  (3) writes `audit_log`, (4) enqueues follow-up jobs/notifications.
- Pure logic (dates, pricing, health, permissions) goes in `packages/core` with unit tests. No I/O there.
- Event instantiation, anchor shifts and template propagation each have **one** service function used by
  all callers (UI, bulk jobs, imports).

## Database
- Edit `packages/db/src/schema/*.ts`, then `pnpm db:generate --name <what>` and commit the SQL.
  Never edit applied migrations.
- Column naming: camelCase in TS, snake_case in SQL (Drizzle `casing: "snake_case"`).
- IDs: `id()` helper (UUID v7). Timestamps: `timestamps` helper. Money `*_cents` integer; lengths `*_cm` integer.
- Business tables get `archivedAt` instead of hard deletes.

## Dates & time
- Store instants as `timestamptz`. Event days and due dates are `date`. Convert with `@marktwerk/core` helpers in
  `Europe/Berlin`. Never use `new Date(y, m, d)` for business dates.

## UI
- shadcn/ui components in `src/components/ui` (generated, don't hand-edit except for theming).
- Feature components live next to their route or in `src/components/<feature>/`.
- Status colours: use the `status-ok / status-warn / status-critical / status-info` theme tokens.
- Dense, keyboard-friendly back office. Field screens: min 48 px touch targets, high contrast.

## Testing
- `packages/core`: unit tests for every rule (Vitest). Test DST and edge dates for anything date-related.
- Services: integration tests against a real Postgres (test database, from M1).
- E2E (Playwright, from M2): login, create event from preset, complete a task, permit reminder.

## Git
- Branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`. Small PRs. Conventional commit messages
  (`feat(tasks): …`).
- `pnpm check` must pass before pushing; CI runs the same.
- Record expensive-to-reverse decisions as an ADR in `docs/architecture/adr/`.
