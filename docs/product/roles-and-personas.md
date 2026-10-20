# Roles & personas

marktwerk serves one company. Four kinds of people touch it.

## Internal roles (log in to the back office / field app)

| Role (`code`) | Typical person | Needs | Default permissions |
|---|---|---|---|
| **Owner** (`owner`) | Geschäftsführer / boss | 10-second health check of every upcoming market, risks, money, who is overloaded. Approves exceptions. | Everything, incl. user management, finance, settings. |
| **Office manager** (`manager`) | Büro / Disposition | Runs the week: creates markets, assigns tasks, processes email, handles bookings and permits. | Everything except user management and company settings. |
| **Staff** (`staff`) | Office or part-time team member | Sees and completes their own tasks, works the inbox items assigned to them, edits vendors/bookings. | Read most things; write tasks, bookings, vendors; no finance settings, no deletes. |
| **Field crew** (`field`) | Platzwart / market-day helper | On market day: checklist, check-in, walk-up vendors, cash, incident reports — on a phone, outdoors, early. | Field app only, scoped to markets they are rostered on. |

Permissions are enforced server-side through a single policy module
(`packages/core/src/auth/permissions.ts`), never only in the UI.

## External people (no back-office login)

| Who | Touchpoint | Phase |
|---|---|---|
| **Vendor** (Händler) | Public booking form, email, later a self-service portal (magic link, no password) to see bookings, invoices, QR pass. | Booking form: Phase 2; portal: Phase 3 |
| **Authority** (Ordnungsamt, landowner, police, GEMA…) | Only via email/letters; stored as `authority` contacts linked to permits. | Phase 1 (as contacts) |

## Personas used for design decisions

- **Petra, owner, 54** — on her phone between meetings; wants red/yellow/green, not tables. "Is anything going to blow up in the next two weeks?"
- **Jonas, office manager, 31** — desktop, two screens, keyboard power user. Lives in the inbox and the task list. Hates retyping data from emails.
- **Ayşe, part-time staff, 24** — gets tasks assigned, needs clarity on *what*, *by when*, *for which market*, and where the related documents are.
- **Dieter, Platzwart, 62** — 5:30 am, rain, gloves, patchy reception, older Android phone. Big buttons, few screens, works offline.
- **Vendor Maria, regular, vintage clothes** — wants "my usual spot, same as always" in one click; asks things by email.
