# 0007: Tooling: TypeScript 6, pnpm 10, Biome

**Status:** accepted (2026-10-20)

## Context
As of October 2026: TypeScript 7.0 (Go-native compiler) is out but doesn't yet expose the JS compiler API
that Next.js type-checking and many tools depend on. pnpm 12 is a brand-new Rust rewrite. ESLint 10 +
Prettier would mean two tools to configure.

## Decision
- **TypeScript 6.0.x** (last JS-based line). Re-evaluate TS 7 when Next.js and typescript-eslint officially support it.
- **pnpm 10.x** pinned via `packageManager`. Move to pnpm 11/12 when it has matured (lockfile compatible).
- **Biome 2.5** for linting *and* formatting (Next.js + React domains enabled). No ESLint/Prettier.
- **Vitest 5** for unit tests, **Playwright** for E2E (from M2).
- Node **24 LTS** (`.nvmrc`); minimum 22.18 (pg-boss/Vitest requirements).

## Consequences
- Fast, simple toolchain. Biome has fewer Next-specific rules than `eslint-plugin-next`; acceptable.
