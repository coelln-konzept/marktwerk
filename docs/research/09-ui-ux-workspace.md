# Research 09 — UI/UX: standards, references, customisable workspace

*Dedicated UI/UX research (2026-10-21) for the from-scratch redesign. Web claims from search snippets (direct page fetching was blocked); library facts verified with npm and inspected tarballs; (unverified) marks background knowledge. Decisions taken on this basis are recorded in docs/product/ux-concept.md and ADR 0018.*

**How this was done.** I read the vision, research 05, the roadmap and the personas docs, and looked at the current shell. `apps/web` already uses Base UI, Tailwind 4 with shadcn-style `.dark` tokens, a lucide sidebar and next-intl. I ran 44 web searches. WebFetch failed in this environment (DNS errors), so web claims rest on search snippets. Library facts come from `npm view` and from tarballs I downloaded and inspected locally. Sizes are my own measurements: esbuild-minified ESM, then gzip -9, whole file, no tree-shaking, CSS excluded. Anything marked **(unverified)** comes from background knowledge only.

---

## 1. What the design systems say: rules you can copy

**Master-detail and columns (SAP Fiori Flexible Column Layout).**
- Start with one column and open more as the user navigates forward. Fiori says "Do not start your application with three columns."
- Default widths: the 2nd column takes 33% and the 3rd 25% (67/50% overrides exist). Each column scrolls on its own.
- Tablets show 2 columns, phones show 1.
- Source: https://www.sap.com/design-system/fiori-design-web/v1-84/page-types/page-layouts/flexible-column-layout/usage. SAP's own HCM pattern goes further and recommends only two sections: https://www.sap.com/design-system/hcm/patterns/structure-and-layout/master-detail/usage
- **Rule for us:** open a workspace with at most 2 panes, allow a 3rd, never more than 3 visible on one screen.

**Dialog vs side panel vs page.**
- Fiori: use a dialog for a short confirmation step or to create an object with few fields (older versions said "up to 8 fields"). Use an object page for many fields. Dialog data is lost on refresh. https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/dialog/usage
- Carbon "create flows": modal for simple creation with a couple of fields; side panel for medium complexity when the user should stay oriented to the page; tearsheet (near full-screen) for complex flows. https://v10.carbondesignsystem.com/community/patterns/create-flows. Carbon's modal page adds that repeated tasks belong on the main page, not in modals. https://carbondesignsystem.com/components/modal/usage
- Atlassian plans to deprecate Drawer in favour of Modal with its new navigation. https://atlassian.design/components/drawer
- **Rule for us:**
  - Modal: up to about 8 fields, quick creation, or confirming something irreversible.
  - Side panel / peek: viewing or editing details while keeping the list visible.
  - Full panel or page: the event, a template, the month close.
  - Never put a form someone may abandon halfway into a modal.

**Density.**
- Carbon table rows: xs 24, sm 32, md 40, lg 48, xl 64 px. The header row matches the row size. Tall rows are only for two-line content. https://carbondesignsystem.com/components/data-table/style
- Salesforce has a per-user Comfy/Compact switch with an org-wide default. Compact puts labels beside fields and shows about 30% more information. https://developer.salesforce.com/blogs/2018/08/new-density-settings-for-the-lightning-experience-ui-in-winter-19
- Fluent 2 uses a 4 px base spacing unit. https://fluent2.microsoft.design/layout
- **Rule for us:** 4 px grid. Two density modes: "Standard" with 40 px rows and labels above fields, and "Kompakt" with 32 px rows and labels beside fields. Toolbars are 48 or 32 px to match. Body text 14 px, 13 px in compact mode. Running text such as notes and template descriptions is capped at about 70 characters per line (around 60–75ch, a common typographic rule, **unverified** as a specific design-system rule).

**Tables and index pages (Polaris).**
- Name the resource type in the heading.
- Show row actions on hover or selection.
- Offer bulk actions for operations done on many rows at once.
- Show an empty state (illustration, one sentence, primary and secondary action) only when there are truly no items. A filter returning nothing is a different state.
- Always offer a Back control or breadcrumbs; don't rely on the browser button.
- Sources: https://polaris.shopify.com/components/index-table, https://shopify.dev/docs/api/app-home/patterns/templates/resource-index

**Workspaces in consoles.**
- **Salesforce Lightning console:** records open as workspace tabs, related records as subtabs. Opening a record from a list switches the list into split view next to it. Ctrl/⌘-click opens a new workspace tab. Tabs can be pinned. https://developer.salesforce.com/docs/atlas.en-us.api_console.meta/api_console/sforce_api_console_js_lex_intro.htm. Since Spring '23, least-recently-used tabs are unloaded once a limit is exceeded. https://www.asagarwal.com/?p=23238
- **Dynamics 365 multisession:** up to 9 sessions with 10 tabs each. Tabs stay open while you switch sessions. Admins define "application tab templates" that decide what opens when a session starts. https://learn.microsoft.com/en-ca/dynamics365/customer-service/implement/csw-overview, https://learn.microsoft.com/en-us/training/modules/implement-multi-session-experiences/implement
- **Primer PageLayout:** the side pane is `resizable`, `sticky`, and remembers its width per user (`widthStorageKey`, stored in localStorage). https://primer.style/product/components/page-layout
- **Takeaway:** hard caps on tabs and panes are normal in mature consoles. Admin-defined starting layouts (Dynamics) are the precedent for role default workspaces.

**Keyboard and notifications.**
- Linear: Space toggles a "peek" preview, holding Space peeks temporarily, J/K or arrows move through the list. In ⌘K, the right arrow shows a preview. https://linear.app/docs/peek.md
- Favorites are personal sidebar shortcuts that can point at custom views. https://linear.app/docs/favorites

---

## 2. Reference products: what to copy, what to avoid

| Product | Copy | Avoid |
|---|---|---|
| **Linear** | Peek on Space; J/K navigation; ⌘K with preview; favourite views in the sidebar | Keyboard-only features (peek can't be triggered by mouse), which fails our mouse-first users |
| **Notion** | Side peek / centre peek / full page as one item shown three ways; the open mode is set per view (https://www.notion.com/releases/2022-07-20) | The setting changes the view for *everyone*; keep personal preferences personal |
| **Airtable** | Three kinds of view: collaborative, personal, locked. "Copy the locked team view into a personal one" (https://support.airtable.com/docs/locked-views) is the model for team workspace templates | Too many views with no ownership turns into sprawl |
| **Attio** | Table and kanban over the same list; each view has its own saved filters and sort; record preview from a card (https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views.md) | Record vs list-entry fields confuse non-technical users |
| **Front** | Three panes (collapsible sidebar, list, detail); fixed "Assigned to me / Shared with me" sections; internal comments on threads (https://front.com/blog/front-inbox-redesign, https://help.front.com/t/h429y2) | Too many sidebar sections; Front keeps core sections non-removable for a reason |
| **monday / ClickUp / Asana** | Asana Workload: effort against capacity per person, drag to reassign or reschedule, hours or points (https://asana.com/features/resource-management/workload) | monday users complain about workload widgets that can't combine items and sub-items, and about missing forward look (https://community.monday.com/t/workload-view/66879). ClickUp-style "everything is configurable" overwhelms users (**unverified**, background) |
| **Trello** | Drag a member's avatar from the header onto a card to assign; key `a` to assign (https://support.atlassian.com/trello/docs/adding-a-member-to-a-card/). This is the precedent for our people rail | Assigning someone silently subscribes them to every change |
| **Grafana / Retool** | Grid of movable widgets saved as JSON with a `schemaVersion` and migration steps. Grafana: 24 columns, 30 px row units, explicit edit mode (https://grafana.com/docs/grafana/latest/reference/dashboard/) | Dashboards nobody owns pile up; old exports fail migration (schemaVersion below 36 is rejected) |
| **VS Code / JetBrains** | VS Code: editor groups in a grid, "Open to the side", empty groups (https://code.visualstudio.com/updates/v1_25). JetBrains: *Window → Layouts → Save Current Layout as New*, a built-in Default layout you can't delete, and "Restore Current Layout" back to the last save (https://jetbrains.com/help/idea/2023.3/tool-window-layouts.html) | Developer-grade freedom (any nesting, floating tool windows) is too much for an office manager |
| **Bloomberg Launchpad / TradingView / trading platforms** | Linked panels: TradingView lets you sync symbol, interval, crosshair or date per layout, or per group (https://in.tradingview.com/support/solutions/43000629992). Colour link groups: one colour means "these panels follow the same selection" (https://docs.rivalsystems.com/en/articles/8476865). Named layouts with explicit Save (Ctrl+S) *or* autosave | Colour-group linking is expert UI; Launchpad details could not be verified |
| **Zendesk Agent Workspace** | Ticket tabs; a right context panel whose width persists across tickets; urgent live items pinned at the right end of the tab bar (https://support.zendesk.com/hc/en-us/articles/4408821259930) | Moving information into a panel that may be closed hides it. Agents lost the "has side conversations" header indicator (https://support.zendesk.com/hc/en-us/articles/4408836526362) |
| **Salesforce Service Console** | Split view list next to tabs; subtabs; capping loaded tabs | Iframe-heavy performance problems. The old guidance was at most 20 primary tabs and 10 subtabs (https://developer.salesforce.com/blogs/2017/01/salesforce-console-performance) |
| **Crescat / Rentman** (event industry) | Crescat: event templates, day sheets, drag-and-drop scheduling (https://sourceforge.net/software/product/Crescat/). Rentman: shortages as red lines on an availability timeline, one central Shortages list grouped by project, "solve with subrental" (https://support.rentman.io/hc/en-us/articles/27733339768594-Planning-equipment) | Both are module silos: the user jumps between modules instead of seeing one event across all of them |

---

## 3. Customisable workspaces in depth

**Three layout models.**
1. **Tiling:** a fixed split tree you can resize. Examples: react-resizable-panels, Fiori FCL.
2. **Docking:** tabs can be dragged into any group or onto any edge to split. Examples: VS Code, dockview, FlexLayout.
3. **Free-floating:** overlapping windows. Examples: Bloomberg, some trading platforms.

Floating windows overlap, need z-order management and get lost behind each other, so they are wrong for this audience. **Recommendation: docking restricted to tabs + splits.**
- At most 3 visible groups. No nested floating. Maximise allowed.
- Popout into a second browser window is deferred. Jonas's second screen is better served by a *second browser window with its own workspace*, which works with plain URLs.

**Opening "to the side".**
- Every list row and every link to an entity gets:
  - a hover icon "Rechts daneben öffnen" (open to the right),
  - a context-menu entry,
  - **Shift+click** as the shortcut.
- **Leave Ctrl/⌘-click alone.** Browsers already use it for "new tab", and real URLs make that work for free. Salesforce overrides it; we shouldn't. VS Code uses Alt+click in its explorer for "open to the side" (**unverified** detail).
- **Peek** (Space, or click on the row's peek icon) is the lightweight alternative. Expect most users to peek far more often than they split.

**Linking panels.**
- Use one simple concept: a panel can **follow** another. Example: the "Veranstaltungen" list drives the event panel next to it, and the board drives the task detail.
- Show it as a chain icon in the panel header ("folgt: Veranstaltungsliste"), on by default when a panel was opened from a list.
- Colour link groups (Bloomberg/TradingView) are overkill for 3 panes. Keep that model only as a future option.

**Saved workspaces.**
- Keep two layers, as TradingView and JetBrains do:
  1. *Current state* is autosaved per user per workspace.
  2. *Named workspace* is saved explicitly: "Speichern", "Als neuen Arbeitsbereich speichern…", "Auf gespeicherten Stand zurücksetzen", and "Standard wiederherstellen" (built-in role preset, not deletable).
- Provide a "Layout sperren" (lock layout) toggle.
- Team templates are curated by owner or manager and **copied on use, never live-linked**. This follows Airtable's locked-view-to-personal-copy pattern and matches the existing rule that "template changes never propagate automatically".

**Persistence model.**
- Store layouts server-side in Postgres, e.g. a `workspace` table:
  - `id`, `owner_user_id` (null for templates), `name`, `role_preset`, `is_template`
  - `layout jsonb`, `schema_version int`, `updated_at`
- Store **our own layout schema**: groups, panels as `{type, params, sizes}`. Keep an adapter to the docking library's JSON so the library is replaceable.
- Never store data in a layout, only references such as `{type:"event", params:{eventId}}`.
- Panel types live in a versioned registry. Migrations go in `packages/core` with Vitest tests, Grafana-style `schemaVersion` steps.
- On load:
  - an unknown or retired panel type renders a placeholder ("Diese Ansicht gibt es nicht mehr – entfernen"),
  - a deleted entity renders "Veranstaltung gelöscht",
  - every panel still calls `requirePermission()` on the server, so a layout can never leak data after a role change.
- Layout writes go through a server action with `requireUser()`. They are preferences, not business mutations, so no `audit_log`. That is an assumption to confirm.

**URLs, back, refresh, bookmarks.**
- Next.js parallel routes are **not suitable** for user-defined layouts. On a hard refresh, Next "cannot determine the active state for the slots" and renders `default.js` or a 404 (local docs: `next/dist/docs/01-app/03-api-reference/03-file-conventions/parallel-routes.md`).
- React `<Activity>` state preservation across navigations needs Cache Components, which ADR 0004 turns off (`preserving-ui-state.md`).
- So:
  1. The **path is the focused/primary panel's own route** (`/veranstaltungen/123`). Every panel type is also a full page at that URL.
  2. `?ws=<workspaceId>` restores the rest of the layout from the server.
  3. Navigation inside the primary pane uses `pushState`, which Next integrates with `useSearchParams` (`single-page-applications.md`). Changes in secondary panes use `replaceState`, so Back behaves predictably.
  4. Each panel has "Link kopieren" and "Als Seite öffnen".
  5. Workspace panels stay mounted in a client shell, so secondary panes keep their state.

**Responsive behaviour.**
- 1440 px and up: 3 panes. 1024–1439 px: 2 panes. Below 1024 px: one pane, with the other panes reachable as tabs or a "Bereiche" switcher. This mirrors Fiori FCL.
- Phones never get docking. Field crew get the separate single-column magic-link pages.

**Accessibility of docking and drag-and-drop.**
- WCAG 2.2 SC 2.5.7 Dragging Movements (AA) requires a *single-pointer, non-drag* alternative for kanban moves and sortable lists. Keyboard support alone does not satisfy it. https://kb.daisy.org/publishing/docs/wcag/dragging-movements.html
- Recommended pattern:
  - a focusable drag handle plus a "⋯ → Verschieben nach… / Zuweisen an…" menu (Atlassian pattern, https://appinstitute.com/drag-and-drop-design-accessibility-best-practices/),
  - announcements through `aria-live`,
  - keyboard: Space to lift, arrows to move, Space to drop, Esc to cancel (from Atlassian's own a11y bug reports, https://jira.atlassian.com/browse/JRASERVER-77297).
- For docking itself: menus "Nach rechts verschieben / In neue Gruppe / Maximieren", plus F6 to cycle between groups.

**Risks and how to mitigate them.**
- NN/g's guidance is to assume "users will not change defaults" (https://www.nngroup.com/videos/the-danger-of-defaults/). So **the role presets are the product**, and customisation is the power layer for Jonas.
- Layout rot (stale panes, 10 near-identical workspaces):
  - cap named workspaces at about 8 per user,
  - show "zuletzt benutzt" (last used),
  - offer one-click reset,
  - offer layout undo through a toast after any docking move.
- Discoverability: the split icon is visible on hover; first-run hints are shown once.
- Research 05 said "don't hide existing functions behind menus at the start". So the sidebar keeps every module with text labels, and workspaces are additive.

---

## 4. React docking/split libraries (checked 2026-10-21)

| Library | Latest version (date) | React 19 peer | Licence | Deps | Size min+gz (my measurement) | Serialisation | Keyboard / a11y | Floating / popout | Maintenance |
|---|---|---|---|---|---|---|---|---|---|
| **dockview-react** | 8.6.1 (2026-10-19) | ^16.8–^19 | MIT | 0 runtime deps beyond dockview-core | core ≈ 94 kB + react binding ≈ 5 kB | `api.toJSON()` / `fromJSON()`, `onDidLayoutChange` | tablist with arrow keys; opt-in `keyboardNavigation`: Ctrl+]/[ tabs, F6 groups, **Ctrl+M keyboard docking with live preview**; `aria-live` announcements that **can be localised** (`messages`, `getAnnouncement`) | yes / yes | very active, several releases per week |
| **react-resizable-panels** (shadcn "Resizable") | 4.14.8 (2026-10-20) | ^18–^19 | MIT | 0 | ≈ 21 kB | `useDefaultLayout({storage})`, `onLayoutChanged`, `defaultLayout` | separators: arrows, Home/End, Enter to collapse; ARIA value attributes | no / no | very active |
| **flexlayout-react** (Caplin) | 0.11.1 (2026-09-26) | ^18–^19 | MIT | few | ≈ 54 kB | `Model.toJson()` / `fromJson()`, `useUndo` hook | ARIA roles, configurable keymap, visible focus | yes / yes; borders | active, still pre-1.0 |
| react-mosaic-component | 7.2.1 (2026-09-28) | 16–19 | Apache-2.0 | react-dnd stack, lodash, uuid | not measured (many deps) | tree object | weak (**unverified**) | no | active; tiling only |
| allotment | 1.20.6 (2026-10-12) | ^17–^19 | MIT | few | ≈ 10 kB | sizes only | basic | no | slow (gaps of 6–12 months) |
| rc-dock | 4.1.0; 5.0.0-alpha in progress | ≥18 | Apache-2.0 | lodash, rc-component | not measured | yes | limited (**unverified**) | yes / yes | churn (v5 alpha) |
| golden-layout | 2.6.0 (**2022-09**) | none | MIT | — | — | yes | — | yes | **effectively dead; don't use** |

Notes on the table:
- dockview also offers `locked`, `disableDnd`, `maximizeGroup` and layout undo/redo (`api.undo()`).
- Its fast release pace is a risk: pin an exact version.
- There is also a pinned-tabs feature.
- Sources: npm; https://dockview.dev/docs/advanced/accessibility; https://dockview.dev/docs/overview/whats-new-v7. I checked option names in the 8.6.1 `.d.ts` files.

**Recommendation: dockview-react 8.6.1**, configured narrowly:
- floating and popout off,
- at most 3 groups (enforced in our own code),
- `keyboardNavigation` on,
- German strings for its announcements,
- styling through our Tailwind tokens.

It is the only option that covers the product owner's whole requirement out of the box (move, split, tabs, save/restore) *and* has keyboard docking plus localisable screen-reader text. It is MIT with zero dependencies. The cost is about 100 kB gzipped, so lazy-load it inside the workspace shell only.

**Fallback: react-resizable-panels 4.14.8** for a *tiling-only* model:
- main pane plus up to 2 side panes, with our own tab strips,
- already the shadcn primitive, about 21 kB.

If the product owner picks tiling over docking (decision 1 below), this becomes the primary choice. flexlayout-react is a credible second fallback.

Kanban drag-and-drop is a separate need:
- `@atlaskit/pragmatic-drag-and-drop` 4.0.0 (2026-09, Apache-2.0) is maintained.
- `@dnd-kit/core` 6.3.1 has not been released since 2024-12. `@dnd-kit/react` 0.5.1 (2026-10) is still pre-1.0.
- `cmdk` 1.1.1 (2025-03) works for ⌘K but releases slowly.

---

## 5. Principles applied to marktwerk

**Nielsen's heuristics in ops terms.**
- *Visibility of status:* every list shows counts and how fresh the data is.
- *Match the real world:* their own vocabulary (Preset → Termine, Platzkarte, KW).
- *User control:* undo instead of "Sind Sie sicher?". Practitioners report confirmation fatigue: people click confirm without reading (https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj). Confirm only irreversible actions, and name the consequence: "Monat März abschließen – Stunden danach nur mit Begründung änderbar".
- *Recognition over recall:* labelled sidebar, recent items, ⌘K as an accelerator rather than the only path.
- *Error prevention:* inline Minijob and §17 MiLoG warnings *before* saving.

**Status language.**
- Always colour + icon + text, never colour alone (WCAG 1.4.1).
- One fixed vocabulary across modules: Offen · In Arbeit · Erledigt · Überfällig · Blockiert; for money: Geplant · Fällig · Bezahlt · Überfällig.
- Amber means "warning, act soon"; red means "overdue / legal limit".

**Optimistic UI.** Use it for assign, drag, tick-off and mark-paid, with a 5–8 s undo toast. Mark-paid also needs a server-confirmed state because it feeds finance.

**Empty, loading and error states.**
- Skeletons that match the table rows.
- An empty state that teaches ("Noch keine Genehmigungen für diesen Standort – aus Vorlage anlegen").
- A filtered-empty state: "Keine Treffer – Filter zurücksetzen".
- Errors with a retry action and no data loss.

**Change management for users coming from Outlook, paper and Excel.**
- Keep their mental models:
  - Preset → Termine exactly like the old PHP admin,
  - an Outlook-like 3-pane inbox (Phase 2),
  - Excel-like grids for hours and templates, with paste from Excel,
  - printable views (day sheet, hours list).
- Sandbox first, as the client asked.
- Release workspaces to Jonas first; give the owner a fixed "Überblick".

**German specifics.**
- *Text expansion:* plan for +30% on average. Short labels grow far more; IBM-derived tables cite 100–200% for strings of 1–10 characters (https://spring-20.lightningdesignsystem.com/guidelines/localization). Example: "Save changes" goes from 12 to 22 characters (https://simplelocalize.io/blog/posts/text-expansion-ui-localization/). So:
  - no fixed-width buttons or tabs,
  - `hyphens: auto` (the existing `<html lang>` is set correctly) plus `&shy;` in long compounds such as "Halteverbotsgenehmigung",
  - test every screen in DE first.
- *Formats* via `Intl` with `de-DE`:
  - dates `16.05.2026`, short form `Sa 16.05.`,
  - times `14:30 Uhr`,
  - money `1.234,56 €` (with a non-breaking space),
  - centimetres shown as `4,50 m`,
  - **calendar weeks (KW 20)**, which Germans plan in,
  - week starts Monday.
- *Sie vs du:*
  - Shopify's German admin help uses "du" (page title "Auswahl deiner Kontosprache…", https://help.shopify.com/de/manual/your-account/languages).
  - Zulip prescribes "Du" (https://zulipaaa.readthedocs.io/en/latest/translating/german/).
  - SAP, DATEV and Lexware traditionally use "Sie" (**unverified**). I could not verify Personio or lexoffice.
  - The real failure mode is *inconsistency*: 1Password used "du" on the web and "Sie" in its apps (https://www.1password.community/1password-at-home-31/german-localization-form-of-address-du-vs-sie-on-website-vs-apps-11392).
  - Practical rule: write UI copy impersonally where possible (infinitive or noun labels: "Aufgabe zuweisen", "Keine Aufgaben fällig") and pick one form for the rest (decision 8).
- *Accessibility law:* the EAA (in Germany the BFSG) targets products and services offered to consumers. An internal tool used exclusively by employees is generally out of scope (https://karlgroves.com/the-european-accessibility-act-and-b2b-software-what-internal-platforms-must-comply-with/; I could not check the BFSG text; **not legal advice**). **But** the Phase 4 vendor booking form and portal is likely in scope, because many flea-market vendors are private individuals, i.e. consumers. Build to WCAG 2.2 AA now so it can be reused there.
- *Dark mode:* tokens already exist in `globals.css` (`.dark`). Ship light as the default, offer "System / Hell / Dunkel" cheaply, and test status colours in both. Field use outdoors (Phase 3) needs a high-contrast *light* theme, not dark.

---

## 6. Core flows

1. **Many events from a preset** (references: their own PHP admin, Google Calendar-style recurrence, Rentman conflicts):
   - Pick the preset, then a 3–6-month calendar for multi-select (click, Shift-click a range) or a rule helper ("jeden 2. Sonntag, Apr–Okt").
   - Overlay NRW holidays and existing events at that location.
   - Then a **preview table** with warnings shown inline as icon + text: location double-booked, a 4th event that weekend, permit not covered, school holidays.
   - Then "12 Veranstaltungen anlegen". Afterwards, an undo toast and a link to the new list.
2. **Template editing** (references: spreadsheet/Airtable grids, Process Street versioning):
   - **Table first**: Aufgabe · Phase · Anker · Offset (T-180 … T+7) · Werktage/Kalendertage · Rolle · Schätzung · Priorität. Keyboard editing; paste from Excel.
   - A **read-only timeline ruler** previews the result against a sample date. Dragging bars in a Gantt is imprecise for offsets; avoid editing there.
   - "Veröffentlichen" creates a version. "Auf Veranstaltungen anwenden…" is a separate dialog with nothing pre-selected and a per-event diff preview.
3. **Kanban with drag-to-assign** (references: Linear swimlanes, Trello avatar drag, Asana Workload):
   - Columns: Vorbereitung · Diese Woche · Heute · Erledigt.
   - People rail with avatars and **load bars** (estimated h / capacity, amber above 80%, red above 100%). Drop a card on a person, then an undo toast.
   - Non-drag equivalents for 2.5.7: card menu "Zuweisen an…" and key `A` (Trello uses `a`), "Verschieben nach…".
   - Carry-over badge ↻n.
   - Swimlanes by person as a toggle.
4. **"Heute fällig" dashboard** (references: Front's "Assigned to me", Linear Inbox, Things' Today **unverified**):
   - One ranked list grouped Überfällig / Heute / Diese Woche.
   - Filter chips: Alle · Geld · Genehmigungen · Stunden · Aufgaben.
   - Each row: type icon, title, event, due date, amount if any, and **one primary action** (Erledigt / Bezahlt / Öffnen); peek on Space.
   - Next to it: event health for the next weekend. The owner preset is read-mostly.
5. **Permit logbook matrix** (reference: Rentman-style shortage overview; compliance matrices from background knowledge):
   - Rows: locations. Column groups: Stadt (Marktgenehmigung, Wasser, Plakate/Aufkleber, Halteverbot) and Extern (Toiletten, Eigentümer).
   - Cells: icon + short text ("✓ bis 03/27", "⏳ beantragt, Antwort Jan", "! fehlt – Frist KW 48", "–" for not needed).
   - Sticky headers. A cell click opens a side panel with documents, fees and instalments.
   - A second view lays out application windows on a timeline.
   - Default split: matrix on the left, the selected event's permit tab on the right, with linking.
6. **Staff hours** (references: Excel, Personio/Deputy timesheets **unverified**):
   - A month grid with one row per person and days as columns, plus a totals column, a **remaining-allowance bar** (€ and h) with amber/red, and the reason in text ("noch 4,5 h bis 603 €").
   - §17 MiLoG chips: "Tag 5" amber, "Tag 7" red.
   - A month-close stepper: Prüfen → Sperren → Freigeben → CSV.
   - Inline warnings appear while typing, never only after saving.
7. **Payables with instalments:**
   - A payable row expands into instalment child rows. Columns: "Nächste Rate", due date, status.
   - The reminder ladder (14 d / 3 d / fällig) is visible on the row.
   - Mark paid with an undo toast, plus an optional receipt upload by drop. Link back to the permit or event.
8. **⌘K / global search** (references: Linear, Raycast):
   - Covers entities (events, vendors, staff, locations), actions ("Neue Veranstaltung aus Vorlage", "Stunden erfassen"), navigation and **workspace switching**.
   - German synonyms and umlaut-insensitive matching (ae = ä).
   - Right arrow previews; Shift+Enter opens to the side.
   - A visible search field in the top bar, so it isn't keyboard-only.
9. **Notification centre** (references: Linear Inbox, Front):
   - Grouped by object, read/unread, "Erledigt", links that open in the current workspace.
   - It is *not* the source of truth; the dashboard is.
   - Escalations go to the manager. Daily email digest.

---

## (a) Recommended UX concept (14 bullets)

1. **App shell:**
   - left sidebar with text labels, collapsible to icons,
   - top bar with search/⌘K, a **workspace switcher** (a tab row of open workspaces) and notifications.
2. **Every screen is a panel type** (Heute fällig, Board, Veranstaltung, Logbuch, Team, Zahlungen, Vorlage…). Each one renders as a full page at its own URL *or* inside a workspace. One implementation.
3. **Workspace = docking restricted to tabs + splits** (dockview): at most 3 visible groups, no floating, maximise allowed, lazy-loaded.
4. **Role presets** that ship in the product:
   - Owner: "Überblick" (Heute fällig + nächstes Wochenende).
   - Manager: "Bürotag" (Heute fällig | Board), "Genehmigungen" (Logbuch | Veranstaltung), "Geld" (Zahlungen | Veranstaltung·Geld), "Wochenende" (next weekend's events | Board).
   - Staff: "Aufgaben".
5. **Named workspaces per user**, stored server-side with schema versioning: current state is autosaved; Save / Save as / Reset / Restore default are explicit; a lock toggle; layout undo.
6. **Team templates** curated by owner/manager and copied on use, never live-linked.
7. **Open to the side** via hover icon, context menu and Shift+click. **Peek** with Space/click. Ctrl/⌘-click stays browser-native.
8. **"Folgt" linking:** a panel opened from a list follows its selection, shown in the panel header.
9. **URL** = the primary panel's route plus `?ws=`. Secondary panes use replaceState. Every panel has "Link kopieren / Als Seite öffnen".
10. **Responsive:** 3 / 2 / 1 panes at ≥1440 / ≥1024 / below that. Phones get single-column pages. Field crew never see workspaces.
11. **Density:** Standard (40 px rows) by default, Kompakt (32 px) per user. 4 px grid. Running text capped at about 70ch.
12. **Overlays:** modal for ≤8 fields or irreversible confirms; side panel for details; page/panel for objects. Undo toasts instead of confirmations.
13. **Status vocabulary:** one fixed set, always colour + icon + text. Calendar weeks and German formats throughout.
14. **Accessibility:** WCAG 2.2 AA. Every drag has a menu or keyboard equivalent. Docking via keyboard (Ctrl+M) and menus. Localised `aria-live` announcements.

## (b) Decisions for the product owner

1. **How much customisation?**
   - (A) Fixed screens + peek only: simplest, but misses the requirement.
   - (B) Tiling: main + up to 2 resizable side panes with tabs; react-resizable-panels; about 21 kB; easy to learn.
   - (C) Docking: drag tabs to any group or edge, max 3 groups; dockview.
   - (D) C plus floating windows and popouts.
   - **Recommendation: C with D's popout deferred.** B is the safe fallback if the pilot shows confusion.
2. **Default workspaces:**
   - (A) one default for everyone,
   - (B) presets per role,
   - (C) per role plus per-user first-run choice.
   - **Recommendation: B.** Defaults are what most users keep, so they must fit each role.
3. **Who owns workspaces?**
   - (A) per user only,
   - (B) per user + team templates (copied on use),
   - (C) shared, live-edited workspaces.
   - **Recommendation: B.** C causes "someone changed my screen" problems.
4. **Saving model:**
   - (A) autosave only,
   - (B) explicit save only,
   - (C) autosave current state + explicit named saves + reset.
   - **Recommendation: C** (the TradingView/JetBrains model).
5. **Navigation model:**
   - (A) sidebar,
   - (B) top module tabs,
   - (C) command-first.
   - **Recommendation: A + workspace tabs on top + ⌘K as an accelerator.** C fails non-technical users, and research 05 asked not to hide functions.
6. **Event: dedicated page or panel?**
   - (A) page only,
   - (B) panel only,
   - (C) the same component as both, at its own URL.
   - **Recommendation: C.**
7. **Panel linking:**
   - (A) none,
   - (B) simple "folgt" (follow selection),
   - (C) colour link groups.
   - **Recommendation: B.**
8. **Form of address:**
   - (A) Sie,
   - (B) du,
   - (C) impersonal wording plus one of A/B where unavoidable.
   - **Recommendation: C, with du internally if the team uses du with each other** (small Cologne team; matches the WhatsApp tone toward Minijobbers). Vendor-facing documents stay **Sie**. Whatever is chosen must be consistent per audience.
9. **Density default:**
   - (A) Standard,
   - (B) Kompakt,
   - (C) per role (Kompakt for the manager).
   - **Recommendation: A for everyone, with a per-user switch.** Jonas will flip it himself.
10. **Theme:**
    - (A) light only,
    - (B) light + dark following the system,
    - (C) dark by default.
    - **Recommendation: B, light by default.** Tokens already exist. A high-contrast light theme for the field later.
11. **Mobile and field:**
    - (A) responsive back office down to phone,
    - (B) single-pane back office on tablet + separate field pages,
    - (C) native app.
    - **Recommendation: B.** Matches the existing roadmap (magic link → PWA in M13).

## (c) Traps to avoid

- Shipping empty, fully configurable canvases. With weak defaults, users never customise and only see the complexity.
- Floating, overlapping windows, unlimited splits, or opening with three columns.
- Using Next parallel routes for user layouts: slots are lost on refresh. Storing layouts only in localStorage: lost across devices, invisible to support.
- Storing data or permission decisions in layout JSON, or skipping schema versioning: broken workspaces after every new panel type.
- Live-linked team templates: the same failure as auto-propagating timeline templates.
- Overriding Ctrl/⌘-click, or making peek or ⌘K keyboard-only.
- Drag-only interactions: kanban, assigning, docking and reordering all need a menu or keyboard path (WCAG 2.5.7).
- Colour-only status, English-length buttons, truncated German compounds with no tooltip, US date or number formats, no calendar weeks.
- Confirmation dialogs everywhere instead of undo, or optimistic "paid" without server confirmation.
- Moving key indicators into a panel that can be closed (Zendesk's lost side-conversation indicator).
- Hiding modules behind workspaces at launch. The client explicitly asked for nothing hidden.
- An unpinned dockview version: it releases several times a week. Pin it and wrap it behind our own layout schema.

The report wrote no files. Downloaded package tarballs used for measurement are in `/tmp/claude-0/-home-user-marktwerk/b2d3ca33-eb7c-5ce9-b9bc-08a61192697b/scratchpad/pkgs`.