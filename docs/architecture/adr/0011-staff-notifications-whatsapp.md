# 0011: Staff notifications via WhatsApp: wa.me links first, Cloud API later

**Status:** accepted (2026-10-21)

## Context
Field staff only use WhatsApp: no email, no app (research 05). Research 06: WhatsApp Cloud API requires
approved templates for business-initiated messages, costs ≈ €0.046 per utility message in Germany since the
Oct 2026 pricing change (verify), needs a dedicated number (or Coexistence with the WhatsApp Business App),
opt-in, and GDPR/works-council care.

## Decision
- **Step 1 (M6):** marktwerk prepares messages (debounced, quiet hours) and shows a **"Per WhatsApp senden"**
  button that opens `wa.me/<number>?text=…` on the office phone/WhatsApp Web, including the staff member's
  **magic link** to a mobile page (my tasks, shifts, hours) where they confirm. Cost €0, no Meta setup.
- **Step 2 (M14 or earlier if step 1 is too manual):** Meta Cloud API directly (or 360dialog), utility
  templates `aufgabe_zugewiesen`, `schicht_anfrage`, `tagesplan`, `stunden_monat` with quick-reply buttons
  mapped to actions by webhook; delivery status shown to managers only.
- Every staff member has an opt-in record (time, method, wording) and an alternative path (magic link works
  without WhatsApp). Read receipts are never used to evaluate performance.

## Consequences
- Staff need no account; magic links must be signed, scoped, revocable (`magic_link_version`).
- `outbound_message` table supports both channels from the start, so step 2 is a transport change only.
