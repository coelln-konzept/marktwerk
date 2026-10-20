# CLAUDE.md

Guidance for Claude (and humans) working in this repo.

## What this is
marktwerk: an internal operations platform for **one** German flea-market company (single tenant).
The current phase and next milestone are in `docs/product/roadmap.md`. Read `docs/product/vision.md`,
`docs/architecture/overview.md` and `docs/architecture/data-model.md` before building a feature.

## Ask before deciding
The product owner wants to be asked whenever a product or architecture decision isn't already
settled in the docs/ADRs. Log answers in `docs/open-questions.md` (Decided table) or as an ADR.

## Commands
- `pnpm check`: lint + typecheck + tests (run before every commit)
- `pnpm dev`: web (:3000) + worker; needs `pnpm db:up` (Docker Postgres + Mailpit)
- `pnpm db:generate --name <change>` after schema edits, then `pnpm db:migrate`
- `pnpm --filter @marktwerk/core test` for fast domain tests

## Non-negotiables
- **Next.js 16 differs from older versions.** Before writing Next code, read the relevant guide in
  `apps/web/node_modules/next/dist/docs/` (see `apps/web/AGENTS.md`). `middleware.ts` is now `proxy.ts`;
  request APIs are async; Cache Components is deliberately **off** (ADR 0004).
- Every protected page / server action / route handler starts with `requireUser()` or
  `requirePermission()` from `apps/web/src/server/session.ts`. Permissions are defined only in
  `packages/core/src/auth/permissions.ts`.
- Business mutations go through services: permission check → transaction → `audit_log` → jobs/notifications.
- Pure domain rules live in `packages/core` with Vitest tests (dates: test DST + edge cases).
- Market instantiation, anchor shifts and template propagation each have exactly **one** service path.
- No inline UI strings: add keys to **both** `apps/web/messages/de.json` and `en.json`.
- Use the [glossary](docs/product/glossary.md) for domain naming (code in English, UI German-first).
- Money in integer cents, lengths in integer centimetres, instants as `timestamptz`, market days as `date`
  in `Europe/Berlin`.
- Never edit applied migrations; generate new ones.
- Biome is the only linter/formatter (`pnpm lint:fix`). TypeScript 6 (not 7, ADR 0007).

## Layout
`apps/web` (Next.js) · `apps/worker` (pg-boss) · `packages/core` (domain logic) · `packages/db` (Drizzle) · `docs/`.
