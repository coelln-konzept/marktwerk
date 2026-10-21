# Research 08 — Bookings intake, booking form, receipts/invoices, payment checks, newsletter, marketing

*Follow-up research to the client meeting (research 05), 2026-10-21. Sources are search snippets. Not legal advice; confirm tax points with the Steuerberater.*

> **Note:** the "Cologne Altstadt competitor (coelln-konzept)" found below is in fact **our client** (GitHub org `coelln-konzept`): Flohmarkt in der Kölner Altstadt, €15/m, section A bookable only by phone/email. The contested riverside location from the meeting is most likely this one.


**Scope.** I used about 39 web searches. WebFetch failed on every site I tried (DNS errors through the proxy), so everything below comes from search snippets. Points marked **(verify)** rest on thin or conflicting sources. Points marked **(own knowledge)** are my background knowledge, not something I found in this research. None of the tax or legal points are legal advice: have their Steuerberater confirm them.

---

## A. Turning booking emails into records, plus AI drafts with human review

**Deterministic parsers (the old site's emails always use the same layout):**
- **Mailparser.io** works like this: you forward the emails to a Mailparser inbox, set up rules in a browser editor and chain text filters to clean the values. Each result goes to a webhook as JSON, XML or form fields, with custom auth headers. Failed deliveries can be resent ("Re-Schedule Webhook Dispatching"). Its help pages warn that rules break silently when the email template changes. https://get.mailparser.io/email-parser · https://help.mailparser.io/hc/en-us/articles/16253309924116-Email-parsing-rules-not-working-properly
- **Parseur** has three engines: AI fields, zonal OCR, and text/HTML templates for structured emails. I could not confirm whether it shows per-field confidence or has a review queue. https://idp-software.com/vendors/parseur/
- **Power Automate:** Microsoft's lab uses the trigger "When a new email arrives (V3)" with a subject filter. An AI Builder GPT prompt then extracts name, address and date and writes them out. A known problem is that the model also picks up the email signature, and that flow failed until the signature was removed, so strip signatures before extraction. https://learn.microsoft.com/en-my/training/modules/add-intelligence-ai-copilot/exercise · https://learn.microsoft.com/en-us/answers/a/11815853
- **Microsoft Graph change notifications** are the code-first route. Subscribe to `created` events on the Inbox or on `/users/{id}/messages`, renew the subscription before it expires (about 7 days, 10,070–10,080 minutes), and check the `clientState` secret on each notification. A notification only names the message, so you fetch the body in a second call. For a shared mailbox you need *application* permissions; delegated or Mail.Read.Shared permissions can't subscribe. https://learn.microsoft.com/en-us/graph/change-notifications-overview · https://learn.microsoft.com/en-us/answers/questions/1373454/trigger-webhook-when-an-email-is-received
  - **(Own knowledge):** restrict the app to that one mailbox with an Exchange application access policy or RBAC for Applications, so the app can't read every mailbox in the tenant.

**LLM extraction with human review:**
- **Nanonets** returns a 0–100 confidence score per field (`include_metadata=confidence_score`). Its docs list "route low-confidence documents to manual review queues" as a use case. https://docstrange.nanonets.com/docs/confidence-scoring
- **Airparser** holds a document for review whenever any field falls below a confidence threshold. The reviewer sees per-field scores next to the source file, and nothing goes downstream until someone approves it. https://help.airparser.com/data-extraction/human-in-the-loop-review · https://airparser.com/human-in-the-loop-document-parsing/
- **Nylas guide:** check strict fields (dates, emails) with code rather than trusting the model, and flag low-confidence results instead of dropping them. https://developer.nylas.com/docs/cookbook/ai/extract-data-from-email/
- **Recommended review screen:** extracted value, confidence and the cited source text side by side with the original document. https://lilting.ch/en/articles/human-in-loop-document-extraction-confidence · https://www.llamaindex.ai/blog/what-makes-an-extraction-confidence-score-useful
- **Missive and Front:** Missive's AI rules can pull out dates, names and request types, and drafted replies are sent with one click after review. Front's Copilot only writes and summarises. Neither has a review queue for extracted fields; people build that gate in n8n or Make. https://missiveapp.com/docs/advanced-features/integrations/artificial-intelligence · https://n8n.io/workflows/17542-improve-gmail-ai-replies-with-openai-and-tracira-human-feedback/

**Techniques to copy:**
- Show the original email on the left and the draft booking form on the right.
- Clicking a field highlights the text it came from.
- Mark each field as "found", "guessed" (amber) or "missing" (empty, red outline). Plain labels work better than a raw percentage.
- Check every field with code: is the date one of this market's dates, are the meters a whole number from 1 to 20, is the email valid.
- Use the email's Message-ID as an idempotency key so the same email never creates two bookings.
- Keep a log of extracted value vs. confirmed value per field. Those corrections later become few-shot examples for the AI prompt.
- Nothing is ever confirmed automatically.

## B. Multi-date booking forms with per-date options

- **Marketspread:** a "Days to attend" calendar with **Select All**. Clicking a day selects it (it turns blue) and clicking again removes it. https://marketspread.com/learning/articles/selecting-event-days-in-an-application/
- **Eventeny recurring events:**
  - Each date series gets its **own price, quantity cap and charge date**.
  - The organiser approves or rejects each selected date individually, after approving the application as a whole.
  - Date selection is offered for booth, space and rental prices but not for fixed fees.
  - https://help.eventeny.com/en/articles/14743784-set-up-dynamic-prices-for-recurring-events · https://help.eventeny.com/hc/en-us/articles/15273285291163-Enabling-Recurring-Date-Selection-on-Applications
- **Copy patterns in booking back-offices:**
  - Ungerboeck: paste a booking onto several dates or spaces. The details are copied, but the system recalculates the status from its conflict rules. https://supportcenter.ungerboeck.com/hc/en-us/articles/204562858-Copy-and-Paste-Bookings
  - CheckCherry: duplicate a booking, then change only the date and client. https://www.checkcherry.com/help/126-how-do-i-duplicate-a-booking-or-proposal
  - Infor: pick target dates, then review a summary before saving. https://docs.infor.com/scs/2026.x/en-us/scsolh/drx1639643256717.html
- **German examples:**
  - **Ebersberg:** a stall up to 4 m including car costs a flat €26, plus €6 per extra metre. *"Wenn die Auto-Länge größer als der Stand ist, wird … die Länge vom Auto als Standgröße berechnet."* This matches the company's Transit = 6 m rule exactly. https://www.regioactive.de/markt/flohmarkt-ebersberg-volksfestplatz-festhalle-2026-10-03-WWtHp7kjPf
  - Other markets ban cars or send them to a separate lot (Lügde, Dresden, Heidelberg).
  - **Bielefeld:** booking is online only and paid upfront, with no cancellation after booking. Cars may only stop in the loading zone, with the stand number displayed in the windscreen.
  - **Cologne Altstadt competitor (coelln-konzept):** €15/m, and section A is booked **only by phone or email**. https://service.bielefeld.de/detail/-/vr-bis-detail/dokument/7242839/download · https://www.koeln.de/event/flohmarkt-in-der-koelner-altstadt/2026-06-28/
  - I found nothing about Melan, Hochberg or Flohmaxx.
- **How others avoid over-promising on scarce extras:** none of the German examples show a public counter. They say space is "not guaranteed" and that there is "kein Rechtsanspruch". Taking the request first and confirming later (as Eventeny and The Food Trust do) is the common way to protect limited inventory.

## C. Confirmation, receipt and invoice

**Facts found:**
- **VAT exemption:**
  - The BFH (24.1.2008, V R 12/05) held that renting stalls at weekly *or flea* markets is **fully VAT-exempt under §4 Nr. 12a UStG**, even when electricity, organisation and cleaning are included. https://www.iww.de/astw/archiv/--4-ustg--vermietung-von-standplaetzen-bleibt-auch-mit-nebenleistungen-steuerfrei-f52312
  - Older practice split the fee into 75% exempt and 25% taxable. **(Verify)** for festivals: BFH V R 5/13 concerns fun-fair stall rental the tax office treated as fully taxable, and some municipalities treat markets other than weekly markets as taxable. https://www.rechtslupe.de/steuerrecht/ust/standvermietung-auf-wochenmaerkten-36260 · https://www.anwalt24.de/urteile/bfh/2014-02-13/v-r-5_13
- **Kleinbetragsrechnung (§33 UStDV, up to €250 gross):** it needs the supplier's name and address, the date, the type and quantity of the service, the gross amount, and the tax rate *or a note of the exemption*. It does **not** need the recipient, an invoice number or the tax number. https://sparkreceipt.com/de-de/blog/kleinbetragsrechnung/ · https://www.spendesk.com/de/blog/kleinbetragsrechnung/
- **E-invoicing:** every business has had to be able to receive e-invoices since 2025. The obligation to *issue* them starts in 2027 or 2028 depending on company size. **Small invoices (up to €250) and exempt supplies under §4 Nr. 8–29 are excluded.** https://www.ihk.de/rhein-neckar/recht/steuerrecht/umsatzsteuer/e-rechnungspflicht-5931752
- **Eventbrite:** the invoice is a PDF attached to the order confirmation and can be reprinted from the buyer's account. The organiser sets its own name, address and VAT ID; the buyer enters billing details at checkout and can edit them later. https://www.eventbrite.co.uk/support/articleredirect?anum=12929

**Conclusions (own reasoning, verify with Steuerberater):**
- For private sellers, a Platzkarte is enough. As I understand it, there is no duty to issue an invoice to consumers for an exempt rental.
- For businesses, I believe §14 Abs. 2 UStG lifts the invoice duty for supplies exempt under §4 Nr. 8–29, but you can always issue one when asked. I couldn't confirm this wording from the search results.
- Exception: if the company has *opted* into VAT under §9 UStG for business customers, or if festival stalls count as taxable, it would have to issue full 19% invoices. Check their existing Word template to see whether it shows USt.
- **Copyable approach:** design the Platzkarte to also be a valid Kleinbetragsrechnung. Most bookings are under €250 (e.g. 6 m × €15 = €90). Include:
  - company name and address
  - issue date
  - "Standplatz X m, Markt Y, Datum Z"
  - the gross amount
  - "steuerfrei gem. §4 Nr. 12a UStG"
- For anything over €250, or on request, generate a full invoice. It needs a sequential number, the recipient's name and address, the date of service, and the tax number.
- **Different recipient name:** keep optional billing fields (company or name, address) separate from the booker, as Eventbrite does.
- **Invoices are immutable once issued.** Corrections go through a cancellation or correction invoice. **(Own knowledge)** Retention for accounting records is 8 years since BEG IV (2025).

## D. Checking payments by hand first, automation later

- **Lexware Office (formerly lexoffice):**
  - Path: Finanzen → Umsätze → "Umsätze zuordnen" → "+ Manuell zuordnen", then search for an existing document.
  - **Partial payments:** the bank line counts as settled while the document stays open, with the remainder shown as "zu bezahlen" in orange. Each further partial payment is assigned the same way, and the document closes automatically once fully covered.
  - Lexware Büro offers batch matching of one bank line against several open items.
  - https://help.lexware.de/de-form/articles/548936-einem-beleg-mehrere-bankumsatze-zuordnen · https://help.lexware.de/de-form/articles/548883-bankumsatze-zuordnen
- **sevDesk:** reminders are sent manually. A formal dunning letter requires an invoice that already had a payment reminder, and the deadline is set in the settings. The usual sequence has three stages, and fees are allowed from the second reminder onward. https://intercom.help/sevdesk/de/articles/9167192-mahnungen · https://sevdesk.de/ratgeber/buchhaltung-finanzen/mahnwesen/
- **Bank imports:**
  - CAMT.053 is the ISO 20022 XML account statement. Import workflows check for duplicates and verify balances.
  - Sparkasse mainly offers CSV export. CAMT is available through FinTS software, and some branches limit exports to 90–180 days. https://www.lido.app/de/kontoauszug-excel · https://equitania.atlassian.net/wiki/spaces/MM/pages/601096367
- **Live bank connection in 2026:**
  - **GoCardless Bank Account Data (formerly Nordigen) has not accepted new accounts since July 2025.** Existing users keep working. (Source: Actual Budget docs; no official GoCardless notice found.) https://actualbudget.org/docs/advanced/bank-sync/gocardless/
  - **finAPI:** "B2X" (business accounts) is about €100 a month for up to 200 users. A PSD2 licence is needed, or you use finAPI's own. https://www.finapi.io/en/prices/
  - **Enable Banking:** a licensed AISP (Finland) with volume pricing and no public rate card.
  - **FinTS directly (python-fints):** free, but every client must be registered with the Deutsche Kreditwirtschaft, and any call can trigger a TAN challenge (pushTAN). https://python-fints.readthedocs.io/en/latest/upgrading_2_3.html

## E. Newsletter: what German law allows, and which tools fit

- **§7 Abs. 3 UWG lets you email existing customers without consent only if *all four* conditions hold:**
  1. the address was obtained in connection with a sale
  2. the email advertises *your own similar* services
  3. the customer has not objected
  4. a clear opt-out notice was shown **when the address was collected (next to the email field)** and **in every email**, and opting out costs nothing beyond basic transmission fees

  The sender carries the burden of proof. A *cancelled* order does not count. https://www.it-recht-kanzlei.de/e-mail-werbung-ohne-einwilligung-moeglich.html · https://www.it-recht-kanzlei.de/bestandskunden-werbung-email-stornierung-bestellung.html · https://www.e-recht24.de/online-marketing/13374-newsletter-ohne-einwilligung.html
- **Risk:** if the old form never showed condition 4, the current "everyone who ever booked" list doesn't qualify.
- **Visitors** (not customers) need double opt-in.
- **Outlook / Exchange Online limits:**
  - 10,000 recipients per mailbox per rolling 24 hours, and 30 messages per minute over SMTP.
  - **New: a 2,000 *external* recipients per 24 h sublimit, live for existing tenants since 1 Oct 2026 (MC787382).** Once it's hit, external sending is blocked until the window resets.
  - https://mc.merill.net/message/MC787382 · https://easi.its.utoronto.ca/?p=17776 · https://www.codetwo.com/admins-blog/?p=7815
  - **(Own knowledge):** Microsoft's terms forbid bulk mail through Exchange Online, and Gmail, Yahoo and Outlook.com require SPF, DKIM and DMARC plus one-click unsubscribe for bulk senders.
- **Tools:**
  - **Brevo** has real-time webhooks including `unsubscribed`, created via its API. Community threads report they don't always fire for real unsubscribes; the workaround is an automation ("contact unsubscribed" → send webhook). https://developers.brevo.com/docs/how-to-use-webhooks.md · https://community.brevo.com/t/why-does-unsubscribing-per-email-or-per-account-management-not-trigger-my-webhook/3646
  - **CleverReach** has REST API v3 with receiver upsert and an events endpoint. Unsubscribes are typically picked up by polling, not by webhook. https://jentic.com/apis/cleverreach.com
  - **rapidmail** has API v3 (official PHP client) for adding recipients. I found no unsubscribe webhook. https://root.packagist.org/packages/rapidmail/rapidmail-apiv3-client-php
  - Mailjet has an event API with webhooks.

## F. Per-market marketing and posters

- **Cologne:** the city itself grants **no permits for event posters**, apart from its own advertising and election posters. It refers organisers to outdoor-advertising firms (Ströer). Wild posting is fined under §3 Abs. 3 Kölner Stadtordnung. Posters larger than A0 need an individual permit at least 3 weeks ahead (strassennutzungen@stadt-koeln.de). https://www.stadt-koeln.de/artikel/68113/index.html
- **Bergisch Gladbach:** A1 posters on lamp posts only, at most **100 posters and 4 weeks per event**, booked in blocks of 50 lamp posts. https://www.bergischgladbach.de/infoschreiben-zum-verfahren-bei-plakatierung1.pdfx
- **Stickers:** the permit covers only posters carrying the municipality's sticker, placed on the front of the poster. Stickers are sent with the permit (Ammerbuch, Marxzell; NRW towns vary). https://www.ammerbuch.de/fileadmin/Dateien/pdf/Plakatierungsantrag.pdf
- **I found nothing for Düsseldorf.**
- **Typical countdown from event checklists:**
  - design 8–10 weeks out
  - flyers designed and partner newsletter deadlines around 6 weeks (about 30 days)
  - social event page at 4 weeks
  - print and distribute at 3 weeks
  - reminders in the last 1–2 weeks and a final post 1–3 days before
  - https://www.bradley.edu/wp-content/uploads/PublicityPlanTemplate.doc · https://www.Framingham.Edu/Assets/uploads/about-fsu/marketing-and-communications/documents/120818_Promoting-Your-Event_Brochure_updated.pdf
- **Planning tools:** CoSchedule offers reusable project templates for recurring work. Buffer is simple scheduling priced per channel. https://coschedule.com/announcements/whats-new-in-marketing-suite-september-2020-video-update · https://posteverywhere.ai/blog/coschedule-alternatives
- **Photos:** QR or link uploads straight from the phone browser with no app or account, with host moderation and one album per event. https://wetransfer.com/resources/albums/how-to-collect-photos-from-guests · https://vidigami.com/2024/07/23/crowdsource-event-photos-in-1-click/

---

## Recommendations for marktwerk

**(1) Booking intake while the old website stays**
1. **Best option:** read the PHP site's MySQL database directly, or add a JSON POST alongside the email it already sends. This is far more robust than parsing emails.
2. **If the PHP site can't be touched:**
   - Use a Graph subscription on the booking mailbox (application permission, scoped to that one mailbox), or Power Automate "new email (V3)" with a subject filter. Note that the HTTP action is a premium connector **(own knowledge)**.
   - Parse with a **fixed rule set, not an LLM**, because the template never changes.
   - Use the email's Message-ID as an idempotency key.
   - Alert staff when a field fails to parse, since that means the template changed.
3. **Free-text emails:** send them to the LLM to create a *draft* in the right market's queue.
   - Show the original side by side with the fields, using found / guessed / missing badges.
   - Check fields with code against the market's real dates.
   - Strip signatures before extraction.
   - Log every correction.
   - A person always confirms.

**(2) Future booking form**
- Use a list of dates with status badges:
  - **geplant:** visible, not selectable, with a "Benachrichtigen, wenn buchbar" opt-in
  - **buchbar**
  - **ausgebucht**
- Each selected date becomes a row with a metre stepper.
- Each row has a "wie vorheriger Termin" link, and a "für alle übernehmen" link sits after the first row.
- Put the car option under a collapsed "Weitere Optionen" with low-key wording: *"Fahrzeug am Stand (begrenzt, auf Anfrage – Bestätigung durch uns)"*.
- When ticked, ask for vehicle length and enforce **metres ≥ vehicle length**, as in Ebersberg's rule.
- The car part has its own status: *angefragt → bestätigt / abgelehnt*. The per-market "Autoplätze ausgebucht" switch disables the checkbox. Show no public counter.
- Show the cutoff: "Online bis Mo dd.mm., danach telefonisch".
- Food markets show a contact form only.
- The staff phone-entry screen should be keyboard-first, with lookup of existing vendors and the same per-date rows.
- Following Eventeny, keep capacity, price and approval **per date**, not per booking.

**(3) Confirmation, receipt and invoice**
- Generate a Platzkarte PDF and email from templates per market, replacing the Outlook signatures.
- Make it a valid **Kleinbetragsrechnung** (fields listed in section C).
- Add an EPC/GiroCode QR code with IBAN, amount and booking reference **(own knowledge, EPC069-12)** to cut down on mismatched transfers.
- Offer a "Rechnung benötigt" checkbox with an optional separate recipient. That produces a full invoice with a sequential number and recipient address that can't be edited after issue; corrections go through a cancellation.
- Get the Steuerberater's confirmation on three things: whether festivals and food stalls are exempt or taxable, whether a §9 opt-in exists, and how the €2.50 "Internet" fee is treated.

**(4) Payment check session (Mon/Wed/Fri)**
- Staff upload a CSV or CAMT.053 export from online banking.
- The system suggests matches by booking reference, then by amount plus name. Staff confirm in batches with one click.
- Show partial payments the way Lexware does, with the remainder still open.
- Confirming a match can trigger an optional "Zahlung erhalten" email.
- After the deadline, show a list of unpaid bookings with staged reminder drafts. **A person presses send**, and the timestamp and staff member are logged.
- Only after reminders go through staff can bookings be deleted with a notice.
- Later: finAPI, Enable Banking or FinTS. **Don't plan on GoCardless/Nordigen.**

**(5) Newsletter and legal**
- Stop mass-mailing from Outlook. The 2,000 external recipients per day cap is now live.
- Move to Brevo, CleverReach or rapidmail with:
  - a nightly contact sync through the API
  - unsubscribe handling by webhook (Brevo, via an automation) or by polling (CleverReach)
  - a suppression flag in marktwerk that the sync never overwrites
- Add the §7(3) opt-out notice next to the email field on every booking form now, and a one-click unsubscribe link in every mail.
- For the legacy list, consider a one-time re-permission campaign, or at least segment by booking date. Visitors need double opt-in.
- Keep vendors and visitors as separate audiences.

**(6) Per-market communication checklist and media**
- Each market type gets a template of tasks scheduled relative to the event date, like CoSchedule templates:
  - website listing live
  - poster permit applied for (record the city, sticker count received, posters hung, hang-from date, removal deadline)
  - flyer print deadline
  - newsletter slot
  - 3–4 social posts (T-4w, T-1w, T-1d, day of)
  - post-event photo post
- For Cologne itself, plan Ströer or commercial placement rather than a city permit.
- Add a per-market QR or link photo upload for staff phones that auto-tags the market and date, with a "people visible / consent" flag.

**(7) Traps**
- Exchange's external recipient limit, and Microsoft's ban on bulk mail.
- The soft opt-in fails if the notice was missing when the address was collected.
- GoCardless Bank Account Data is closed to new signups.
- FinTS needs product registration and TANs.
- Template-based parsers break silently.
- AI picks up email signatures.
- Graph subscriptions expire after about 7 days, and shared mailboxes need application permissions.
- Bookings over €250 can't use the Kleinbetragsrechnung.
- Invoices can't be edited once issued.
- The VAT status of festival and food stalls, and of the €2.50 fee, is unconfirmed.
- Car length must not exceed the booked stall.
- Never confirm an AI draft automatically.
- Sparkasse export windows can be as short as 90 days, so run sessions often.
