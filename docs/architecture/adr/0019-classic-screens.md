# 0019: Classic screens instead of a customisable workspace

**Status:** accepted (2026-10-21, product owner, session 2). Supersedes [ADR 0018](0018-workspace-architecture.md).

## Context
Two UI directions were designed in Claude Design from the same research ([research 09](../../research/09-ui-ux-workspace.md))
and the same client input ([research 05](../../research/05-client-meeting-2026-10.md)):

| Direction | What it is |
|---|---|
| **A: classic screens** | Sidebar + pages + detail drawers, with all research-based improvements |
| **B: customisable workspace** | The same improvements plus docking panes (max 3), workspace tabs, saved/named workspaces, team templates, "folgt" linking (ADR 0018) |

The product owner chose **A**. Reasons:
- **Less to learn** for a small office. Nobody has to understand panes, layouts or templates before doing their work.
- The client's own principles: **"nothing hidden"** and **step by step** (research 05). A fixed place for every screen
  fits that better than layouts that differ per person.
- **Lower build cost:** no docking library, no layout schema with migrations, no layout persistence, no pane-specific
  data fetching, fewer states to test.
- **Risk:** dockview would have been a pinned third-party dependency at the centre of the shell, with its own
  accessibility and focus behaviour to keep in sync.

The research-based improvements don't depend on docking and are kept in full.

## Decision
1. **Shell:** labelled sidebar + top bar (breadcrumb, search field with ⌘K command palette, "+ Neu", notifications).
   Details in [UX concept v2](../../product/ux-concept.md) §3.
2. **Every view is a route-level page** with its own URL. One implementation per view; no view registry for panes.
3. **Context is kept by overlays, not panes:**
   - **Vorschau** (quick preview card/sheet) from every list row (👁 icon or Space); Esc closes, Enter opens the page.
   - **Detail drawers** from the right for real work (task, permit, payable, instalment).
   - **Event page with tabs** (Überblick · Board · Genehmigungen · Team · Geld · Dokumente · Notizen · Verlauf), each tab
     showing counts/health.
4. **No** dockview, **no** `workspace` table, **no** workspace tabs, saved/named workspaces, team workspace templates or
   "folgt" linking. **No Next.js parallel routes.** No fixed master-detail screen (the optional Fiori variant is dropped).
5. **`user_preference` stays:** theme, density, `sidebar_collapsed`, and per-user saved list filters and calendar layers
   (`saved_views` jsonb). Writes are preferences: server action with `requireUser()`, no `audit_log`.
6. **Linkable overlays (proposal, implementation detail):** Vorschau and drawers are addressed by search params on the
   current page, e.g. `?vorschau=<type>:<id>` and `?detail=<type>:<id>`, so a link can be shared and the browser back
   button closes the overlay. The exact param names are settled when the shell is built.
7. **Responsive:** below 1024 px the sidebar collapses to icons/hamburger and pages go single-column; staff/shift
   screens get a 390 px mobile variant.

## Consequences
- Less code and fewer moving parts in M1; the shell is ordinary App Router layouts + pages.
- Views must stay **self-contained** (own data loading, no assumptions about the surrounding page), so a fixed
  master-detail screen could still be added later without rework.
- People who want two things side by side use two browser tabs (Ctrl/⌘+click is never overridden).
- If multi-pane work is ever wanted again (e.g. Postfach + Buchungen in Phase 2), revisit this ADR; ADR 0018 keeps
  the earlier analysis.
