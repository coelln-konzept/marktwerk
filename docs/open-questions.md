# Open questions & decisions log

## Decided (2026-10-20, product owner)
| Topic | Decision |
|---|---|
| Tenancy | Single company only (ADR 0002) |
| Country / languages | Germany; UI in German + English |
| Stack | Next.js + PostgreSQL + Drizzle monorepo (ADR 0001) |
| Team | Product owner + Claude; GitHub repo `marktwerk` |
| Email provider | Microsoft 365 (ADR 0008) |
| Payments | Bank transfer (Überweisung) + cash on market day |
| Hosting | Keep portable, decide before pilot (ADR 0006) |
| Scale | Medium: 30–150 markets/year, 5–20 staff, 1,000–5,000 vendors |
| MVP focus | Tasks, checklists, deadlines (→ Phase 1 = "Nothing slips") |
| Accounting | Decide later; MVP exports CSV/DATEV |
| Product name | marktwerk |

## Open: product owner
1. **Template propagation default:** when a template is published, should "apply to all future
   markets" be pre-selected, or "none"? (Proposal: pre-select *all future*, always with preview.)
2. **Escalation ladder:** who gets escalations at +1 day: all managers, or a named person per duty role?
3. **Field crew access:** can field crew see only markets they're rostered on, or all markets?
4. **Hosting** (ADR 0006): preference between managed (Vercel + Neon) and self-hosted (Hetzner)?
5. **Vendor data in Phase 1?** Should the MVP already import the existing vendor list (read-only),
   even though booking features come in Phase 2?

## Open: client discovery (ask the flea-market company)
**Operations**
- List of venues, markets per year, which are recurring series vs one-offs, typical market-day timeline.
- Current checklists (paper/Excel) per venue. Who does what? Which duty roles exist in reality?
- Which tasks are most often forgotten or late? Last 3 near-misses?
- How does the team communicate today (WhatsApp groups, phone)? What must stay on WhatsApp?

**Permits**
- Full list of permits per venue: type, authority, lead time, validity, cost, typical conditions (Auflagen).
- Which markets are Sunday/holiday markets? Any "no new goods / no commercial vendors" conditions?
- Do they hold a §69 GewO Festsetzung? Per year, per date?

**Bookings & money (for Phase 2)**
- Price list (per metre, categories, car/van, corner, power), cancellation policy, reservation fees.
- Share of regulars; how Stammplätze are handled today; waiting lists?
- How bookings arrive (form/email/phone/WhatsApp) and the volume per market.
- Invoice samples; VAT situation (§4 Nr. 12 exempt? Kleinunternehmer?); who is the tax advisor; which software (DATEV?).
- Cash on market day: volume, how it's counted and recorded today (→ ADR 0009, ask the Steuerberater).
- Bank: can they export CAMT.053 statements (most German banks can)?

**Microsoft 365**
- Which mailboxes (shared `buchung@`, `info@`…)? Who is the M365 admin (needed for the app registration)?
- Licence type (Business Basic/Standard/Premium)?

**Field**
- Phones used by field crew (Android/iOS, age), mobile reception at venues, gloves/rain constraints.

## Research gaps to close (hands-on)
Our web research couldn't open vendor pages directly and hit search limits, so some findings are
from snippets or background knowledge (marked [K] in research 04). Worth trialling hands-on:
**Crescat**, **Connecteam** (free plan), **Marketspread**, **OnePlan** (demo), and one German tool
(**Marktmeister Pro** or **VOIS|MARKT**).
