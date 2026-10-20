# 0004: Cache Components off; locale from user profile, not URL

**Status:** accepted

## Context
Next.js 16 enables Cache Components (`cacheComponents: true`) by default in new projects. Reading the
session or a locale cookie then requires Suspense boundaries everywhere and `use cache: private`
patterns. Nearly every marktwerk screen is per-user, behind login, and used by fewer than 20 people,
so a prerendered static shell gains almost nothing.

## Decision
- `cacheComponents` and `partialPrefetching` are **off**. Pages render dynamically per request.
- Locale comes from the user's profile, mirrored in the `NEXT_LOCALE` cookie. **No locale prefix in back-office URLs.**
- Revisit both for the public booking form/portal (Phase 2/4), where static rendering and `/de` / `/en`
  URLs do help (SEO, speed on mobile).

## Consequences
- Simpler mental model for feature work: `await requireUser()` at the top of a page just works.
- If we enable Cache Components later, pages that read the session need Suspense boundaries.
