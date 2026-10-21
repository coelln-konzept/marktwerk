# Roles & personas

Revised after the client meeting (research 05). Single company.

## Staff members vs. users
Not everyone who works for the company will log in. **Field staff only use WhatsApp.** So:
- A **staff member** (`staff_member`) is anyone who can be assigned tasks and shifts and whose hours are
  tracked. They're reached via WhatsApp and a personal **magic link** (no password) to a small mobile page:
  my tasks, my shifts, my hours.
- A **user** (`user`) is a staff member with a back-office login and a permission role.

## Permission roles (users)
| Role | Typical person | Default permissions |
|---|---|---|
| **Owner** (`owner`) | Geschäftsführung | Everything incl. user management, finance, company settings. |
| **Office manager** (`manager`) | Büroleitung (today one person does permits, website, bookings, emails, payments, wages) | Everything except user management/company settings. **Receives escalations** (decision 2026-10-21: only the manager, for now). |
| **Staff** (`staff`) | Office staff (e.g. answers phones, enters phone bookings) | Tasks, events (read), bookings, vendors, permits (write), no finance settings, no hours of others. |
| **Field** (`field`) | Market-day lead with a login | **Only events they're working at** (decision 2026-10-21), their tasks, check-in (P3). |

Staff members without login see only their own tasks/shifts/hours through the magic link.
Permissions are enforced server-side via `packages/core/src/auth/permissions.ts`.

## Duty roles (who does what at an event)
Configurable list, mapped per event with defaults per preset. *"Same people do the same thing if they can."*
Seed: Marktleitung (event lead), Aufbau/Logistik (set-up & logistics), Büro/Buchungen, Genehmigungen,
Kommunikation (website, posters, social), Kasse (cash), Wasser/Strom.

## External people (no login)
| Who | Touchpoint | Phase |
|---|---|---|
| **Vendor** | Old website booking form (unchanged), email, phone, talks on market day. Later: new form + portal | P2 internal processing, P4 external |
| **Visitor** | Flyers, posters, website, social, newsletter (later) | P3–P4 (communication) |
| **Authority / landowner / supplier** | Email, letters, phone; stored as contacts linked to permits, payables, rentals | P1 |

## Personas (fictional, based on the meeting)
- **Petra, owner** wants the money and risk picture in seconds: what's due today, which permit is late,
  is the Stadtfest on track, do we need to hire? Thinks in event types and strategy (more food &
  wine, younger vendors).
- **Jonas, office manager** is the person who holds everything together today: files next year's permits
  in autumn, maintains the website dates, answers booking emails with per-market Outlook signatures, checks
  the bank Mon/Wed/Fri, calculates Minijob hours by hand before the 15th. Overloaded; needs things off his
  head and onto a board.
- **Frank, office staff** takes bookings by phone after the Monday cut-off. Needs a 30-second entry screen.
- **Dieter, set-up crew (Minijob)** has no app, no email, only WhatsApp. Phase 1: the office assigns and
  tracks his tasks and enters his hours. Phase 2: he gets a WhatsApp message when a task is dragged onto him and
  taps "Erledigt". Forgets to return the rented standpipes unless reminded.
- **Maria, regular vendor** books by email in free text ("my usual 4 m, with the van"). Values the personal
  contact. Must not be pushed into a robot flow.
