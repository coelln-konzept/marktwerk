# 0018: Customisable workspace: docking shell, view registry, server-side layouts

**Status:** accepted (2026-10-21, product owner decisions; research 09)

## Context
The product owner wants a customisable UI: move views around, split view, save workspaces for later. Research 09
compared design systems (Fiori FCL, Salesforce console, Dynamics multisession), reference products (VS Code,
JetBrains, TradingView, Zendesk, Linear, Notion) and React libraries.

## Decision
1. **Docking restricted to tabs + splits, max 3 visible groups**, no floating windows; maximise allowed; popout deferred.
   Library: **dockview-react 8.6.1**, pinned exactly, lazy-loaded inside the workspace shell only (~100 kB gz).
   Fallback if the pilot shows confusion: tiling with react-resizable-panels (already the shadcn primitive).
2. **View registry.** Every screen is a *view type* (`packages/core` registry: `type`, params schema, title,
   permission requirement, min width, default route). A view renders identically as a **full page at its own route**
   and as a **pane** in a workspace. One implementation per view.
3. **Our own layout schema, not the library's JSON.** `{ schemaVersion, groups: [{ id, size, tabs: [{ view, params }],
   active }], links: [{ from, to }] }`, converted to/from dockview by an adapter, so the library stays replaceable.
   Layouts hold **references only** (`{ view: "event", params: { eventId } }`), never data or permission decisions.
4. **Persistence server-side** in table `app.workspace` (per user; templates with `owner_user_id = null`), with
   `schema_version` and pure migration functions in `packages/core` (Vitest-tested). Autosave of the current state
   (debounced) + explicit named saves; **team templates are copied on use, never live-linked**. Max ~8 named
   workspaces per user. Layout writes are preferences: server action with `requireUser()`, no `audit_log`.
5. **Defaults:** one default workspace **"Start"** for everyone (Heute fällig | Nächstes Wochenende); seeded team
   templates (Bürotag, Genehmigungen, Geld, Wochenende). "Start wiederherstellen" always available.
6. **URLs:** the browser path is the **focused pane's own route**; `?ws=<workspaceId>` restores the rest from the server.
   Navigation in the focused pane uses `pushState`, changes in other panes `replaceState`. Every pane offers
   "Link kopieren" / "Als Seite öffnen". **No Next.js parallel routes** for user layouts (slots are lost on hard
   refresh); panes stay mounted in a client shell.
7. **Linking:** a pane opened from a list *follows* that list's selection (chain icon, unlinkable). No colour groups.
8. **Responsive:** up to 3 groups ≥ 1440 px, 2 groups ≥ 1024 px, a single pane with a switcher below that.
9. **Accessibility:** dockview keyboard navigation on (F6 groups, Ctrl+M keyboard docking), German `aria-live`
   messages; every drag (docking, kanban, assigning) also available via menu and keyboard (WCAG 2.2 · 2.5.7).
10. **Security:** every pane loads data through the same server functions as the page, with `requirePermission()`.
    Unknown view types render a placeholder ("Diese Ansicht gibt es nicht mehr – entfernen"); deleted records render
    "gelöscht"; views the user isn't allowed to see render "Keine Berechtigung".

## Consequences
- Each view is built once and works in both modes; views must not assume full-page width (respect min width).
- Data fetching in panes is client-side via server actions/route handlers (TanStack Query), with the page route
  using the same loaders, so pages keep server rendering.
- Adding a view type = registry entry + component + (if params change) a layout migration.
