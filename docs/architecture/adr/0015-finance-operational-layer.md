# 0015: Finance: marktwerk is the operational layer; the tax advisor keeps the books

**Status:** accepted (2026-10-21)

## Context
Wishes: instalment reminders, receipts, per-event P&L, company costs (research 05). Research 07: no common SME
tool supports instalment plans on payables; DATEV Upload Mail is the cheapest route to the tax advisor;
"ersetzendes Scannen" needs a Verfahrensdokumentation; e-invoice XML must be kept as the original.

## Decision
- Build: payables with instalments and reminders, expenses, receipt capture (photo/PDF/XML), event budget
  (plan/committed/actual), monthly export bundle (PDF + CSV index; DATEV Upload Mail if the advisor uses DUo).
- Don't build: chart of accounts, bookkeeping, VAT returns, bank reconciliation of company accounts.
- marktwerk is a capture-and-forward tool, **not the archive of record**, until the tax advisor confirms a
  Verfahrensdokumentation; documents are immutable (hash, soft delete with audit).
- Vendor-side invoices (Platzkarte/Rechnung, M9) follow GoBD rules (gap-free numbers, immutable, Storno).

## Consequences
No accounting liability; integration with Lexware Office/sevDesk possible later if the company uses one.
