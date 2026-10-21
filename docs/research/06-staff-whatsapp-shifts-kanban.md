# Research 06 — Staff: WhatsApp notifications, shifts & Minijob hours, kanban with estimates

*Follow-up research to the client meeting (research 05), 2026-10-21. Sources are search snippets (direct page fetching was blocked). Figures marked (verify) need confirmation before quoting to the client. Legal points: confirm with the tax advisor / payroll office.*


Research date: 2026-10-21. WebFetch failed with DNS errors, so everything below comes from search snippets. I used about 34 searches. Figures marked **(verify)** come only from third-party sources or conflicted between sources.

---

## A. WhatsApp Business Platform (Cloud API), late 2026

**How business-initiated messages work**
- Outside a 24-hour customer service window, a business can only send **pre-approved templates**. The window opens when the employee messages the business or taps a button. Inside the window, free-form "service" messages are allowed.
- Templates have one of three categories: **utility, marketing or authentication**.
  - Utility means transactional messages tied to something the recipient did or agreed to. Task assigned, shift reminder and schedule change all fit.
  - If a utility template contains promotional content, Meta reclassifies it as marketing. Meta re-checks approved templates on a recurring basis, gives one day of notice, then charges the higher rate.
  - Sources: [Meta utility templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates), [Courier](https://www.courier.com/guides/whatsapp-pricing).
- Review usually takes minutes to 24 hours.

**Buttons**
- A template can have up to **10 buttons**. Quick-reply labels are limited to 25 characters ([360dialog template elements](https://docs.360dialog.com/docs/waba-messaging/template-messaging/template-elements)).
- The quick-reply payload is set **at send time, per button**. For example, `{"type":"button","sub_type":"quick_reply","index":"0","parameters":[{"type":"payload","payload":"task:123:done"}]}`.
- When the employee taps a button, the inbound webhook has `messages[].type = "button"`, carrying `button.payload` and `button.text`, plus `context.id` (the wamid of the original message). This lets you map the tap straight back to the task.
- URL buttons accept one dynamic suffix, so you can attach a signed magic link (`https://app.marktwerk.de/t/{token}`).
- A tap also opens the 24h window, so follow-up replies can be free-form.

**Pricing (per message since 1 July 2025)**
- **The rules changed on 1 Oct 2026:**
  - Service messages (free-form replies inside the window) are now billed. Each business phone number gets the **first 1,000 service messages per month free**.
  - **Utility templates sent inside an open window are chargeable again.** They had been free from July 2025 to September 2026.
  - Incoming messages are still free.
  - Many blogs predate this change and are now wrong.
  - Sources: [Twilio notice](https://help.twilio.com/articles/53100480177819), [YCloud](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026), [Wati](https://www.wati.io/en/blog/whatsapp-service-message-pricing/).
- **German rates from Oct 2026 (verify):** **€0.0456** per utility, authentication or billed service message, and **€0.1131** per marketing message ([meetergo](https://help.meetergo.com/en/integrations/automation/whatsapp-pricing)). An older figure is $0.050 utility / $0.1365 marketing ([Message Central](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-2026)).
- Meta changes rates only on the first day of a quarter ([Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing)).
- **Estimate for marktwerk:** about 20 staff and about 300 templates a month comes to roughly **€14/month** in Meta fees. Confirmations would mostly fall inside the 1,000 free service messages.

**Verification, phone number and limits**
- **Messaging limits** are set per business portfolio (since Oct 2025). A new portfolio can reach **250 unique recipients per 24h**, counting only messages sent outside a service window. Scaling paths raise this to 2,000 and beyond ([Meta messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)).
  - With about 20 staff, **250 is enough, so business verification is optional at first.** Verify the business anyway for stability, the display name and the number count. Unverified accounts reportedly start with 2 numbers and risk restrictions ([Infobip](https://www.infobip.com/docs/whatsapp/get-started/sender-registration)).
- **Phone number requirements:** E.164 format, able to receive an SMS or voice OTP, and not a short code or toll-free number. It must not be active in the consumer or Business app ([Infobip](https://infobip.com/docs/whatsapp/get-started/before-starting-embedded-signup), [Wati](https://www.wati.io/en/blog/whatsapp-api-access/)).
  - The exception is **Coexistence**: the WhatsApp Business App and the Cloud API can share one number. The office keeps using its familiar number on the phone while marktwerk sends templates ([360dialog coexistence](https://docs.360dialog.com/partner/waba-management/whatsapp-coexistence)).

**Opt-in**
- Required before any business-initiated message. The opt-in must name the business and make clear that the person agrees to receive messages from it. Paper, web form or in-person are all acceptable ([Meta opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)).
- Store the timestamp, method and wording per employee.

**GDPR and employees in Germany**
- Meta acts under the **WhatsApp Business Data Processing Terms**, which allow Meta companies as sub-processors. The **Meta Hosting Terms for Cloud API** and the **WhatsApp Business Data Transfer Addendum** cover EU customers ([Meta data privacy](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security), [WhatsApp DPT](https://www.whatsapp.com/legal/business-data-processing-terms)).
- **Local Storage:** you can keep message content at rest in **Germany/EU**. You choose this when you register the number. Content may still be processed outside the EU for up to 60 minutes, and Meta retains messages for up to 30 days. **Local Storage is not supported on Coexistence numbers** ([360dialog local storage](https://docs.360dialog.com/docs/hub/local-storage), [Clickatell](https://guides.clickatell.com/release-notes/q3-jul-sep-2024/channel-updates/whatsapp-data-localization)).
- **Legal basis:**
  - Use Art. 6(1)(b) GDPR (performance of the employment contract) for messages about shifts and tasks.
  - Get voluntary written agreement to use the employee's **private** number.
  - Always offer a non-WhatsApp path, such as the magic-link page, SMS or a printed schedule.
- **Works council:** if one exists, it has co-determination rights under **§87(1) Nr. 6 BetrVG** for time tracking and for read or delivery receipts, because these are technical means capable of monitoring staff. The BayLDA recommends written rules, for example a works agreement ([vendor whitepaper](https://support.getflip.com/hc/de/article_attachments/26196648707089), [IHK/BayLDA](https://www.ihk-nuernberg.de/fileadmin/IHK_Nuernberg/Digitalisierung-IT/Dokumente/FragenBayLDA.pdf)).
- Do not use "read" ticks to evaluate performance. Add the processing to the records of processing activities (Art. 30 GDPR) and to the employee privacy notice.

**BSP options**
- **Meta Cloud API direct:** no licence fee and no BSP. You pay only Meta's per-message fees and do the setup yourself ([Unipile](https://www.unipile.com/de/whatsapp-api-eine-vollstandige-anleitung-zur-integration/)).
- **360dialog:** about **€49 or €99 per number per month**, with no markup on Meta fees (verify) ([360dialog prices](https://docs.360dialog.com/docs/360dialog/prices-plans-and-payment-options)).
- **Twilio:** **$0.005 per message**, inbound and outbound, on top of Meta ([Customer.io](https://docs.customer.io/accounts/billing/whatsapp-billing/)).
- Infobip, Sinch and Bird: usually per-message markups or sales-led contracts. For one company, going direct to Meta or using 360dialog is the sensible choice.

**Zero-cost fallback: wa.me links**
- Format: `https://wa.me/4917612345678?text=<URL-encoded text>`. The number has no "+", no leading 0 and no spaces.
- It opens the manager's own WhatsApp (app or Web) with the text prefilled, and the manager presses send. There is no Meta account, no templates and no fee.
- The downsides are that it is manual, has no delivery tracking and has no buttons. Put the magic link in the text so staff can still confirm.

**Alternatives**
- **Telegram bot:** free, inline buttons, no template approval. But staff would have to install Telegram.
- **SMS via seven.io:** about **€0.075 per SMS** (verify), more than a WhatsApp utility template ([seven.io](https://seven.io/en/prices/), [european-alternatives](https://european-alternatives.eu/de/produkt/seven)).
- **Signal:** no official business API, so not an option.

---

## B. How other products notify field staff

- **Deputy:**
  - A published shift that needs confirmation is sent by **SMS and email with accept/decline**, within a deadline the manager can configure.
  - If nobody confirms in time, the shift becomes an **Open Shift**. A decline shows as "DECLINED" on the roster.
  - SMS costs extra.
  - Sources: [Deputy help](https://help.deputy.com/hc/en-au/articles/4621872438671-How-do-I-enable-or-disable-SMS-notifications-of-shifts-being-sent-to-team-members), [Twilio case study](https://customers.twilio.com/en-us/deputy).
  - **Pattern worth copying: confirm-by-deadline, then auto-release the shift.**
- **Connecteam, Planday:** these push their own apps. Connecteam markets itself as a WhatsApp *alternative*, and WhatsApp delivery only exists through a third-party bridge, Saysimple ([Saysimple](https://www.saysimple.com/integrations/connecteam)).
  - The lesson: the big players need an app installed, which these field staff won't do.
- **monday.com:** no native WhatsApp. Third parties fill the gap:
  - TimelinesAI uses a "When Person is assigned" trigger to send a WhatsApp message ([TimelinesAI](https://help.timelines.ai/en/article/monday-crm-integration-template-send-an-automated-message-187u0bx)).
  - "WhatsApp Integrator" reads the phone number from the Person column's profile ([spec](https://cautious-afternoon-43f.notion.site/EN-Product-Spec-17b802e6d26081798e5dc719ccf86b48)).
  - Zapier offers monday-to-WhatsApp connectors ([Zapier](https://zapier.com/apps/monday/integrations/whatsapp-notifications)).
  - **Pattern: assigning someone triggers a one-to-one message.**
- **WhatsApp-first task tools:**
  - [Task Tracker](https://workspace.google.com/marketplace/app/task_tracker/1028094563209) sends WhatsApp reminders for tasks due today or overdue, and staff log time per task.
  - [TaskFlow](https://apps.apple.com/us/app/taskflow-team-task-manager/id6756993347) lets each user choose WhatsApp, email and/or a **daily digest**.
  - [OMX Sync](https://apps.apple.com/do/app/omx-sync/id6743499685) sends daily WhatsApp reminders for pending tasks.
  - [Periskope](https://docs.periskope.app/tasks-and-reminders/tasks) turns chat messages into tasks.
- **UX lesson:** "seen" is not the same as "committed" ([AppMaster](https://appmaster.io/de/blog/schichttausch-vertretung-klare-genehmigungen)). Use separate buttons for "Zusagen" (I'll do it) and "Erledigt" (done).

**UX patterns that work**
1. **One message per assignment, debounced.** Group drops made within about 3 minutes into one message, with an undo window before sending.
2. **Daily morning digest** (around 07:00) listing today's and carried-over tasks, as one utility template.
3. **Reply-to-confirm** with quick-reply buttons.
4. **Signed magic link without login.** Use an HMAC token scoped to one employee, about 30 days' validity and revocable. It opens a mobile page with "my tasks / my shifts / my hours this month".
5. **Quiet hours:** no messages roughly 21:00–07:00 except urgent changes on the day itself.

---

## C. German shift planning and Minijob rules

**2026 numbers (confirmed by DRV and Minijob-Zentrale)**
- Minimum wage is **€13.90** per hour, and the Minijob limit is **€603/month = €7,236/year**.
- The Midijob range is €603.01–2,000.
- **From 1 Jan 2027:** minimum wage **€14.60**, Minijob limit **€633**.
- Formula: limit = minimum wage × 130 ÷ 3. At minimum wage that allows **about 43.4 hours/month**. In general, maximum hours = limit ÷ the person's own hourly rate.
- Sources: [DRV Rheinland](https://www.deutsche-rentenversicherung.de/Rheinland/DE/Presse/Pressemitteilungen/2025/25-11-21-mindestlohn.html), [DRV 2026](https://www.deutsche-rentenversicherung.de/DRV/DE/Ueber-uns-und-Presse/Presse/Meldungen/2026/260223-minijob-midijob-verdienstgrenzen-steigen.html), [IHK München](https://www.ihk-muenchen.de/minijobs/).

**Annual view and overruns (the office's monthly hand calculation is stricter than the law)**
- The limit is an **average over a forward-looking 12-month forecast**, not a hard limit for each month. The employer must estimate expected earnings at the start and whenever circumstances change materially. Large swings, such as full-time for a few months, are not allowed ([Minijob-Zentrale](https://magazin.minijob-zentrale.de/schwankender-verdienst-im-minijob/)).
- **Occasional unforeseeable overrun:** allowed in at most **2 calendar months within 12 months**, with **at most double the limit (€1,206)** in those months. A typical case is covering for a sick colleague.
  - The employer must be able to prove the overrun was unforeseeable, so document the reason.
  - In the Minijob-Zentrale example, the year's total reaches €7,800 and the job is still a Minijob ([Minijob-Zentrale FAQ](https://www.minijob-zentrale.de/DE/meta/faq-bereich/lohn/18_mehr_als_556euro_verdienen/faq_18_mehr_als_603_euro_verdienen)).
- **Arbeitszeitkonto (working-time account):** allowed with a written agreement and a **fixed monthly pay**, for example €603. Hours are banked and then actually used up again, and every hour must still pay at least minimum wage ([Minijob-Zentrale](https://magazin.minijob-zentrale.de/arbeitszeitkonto-minijob/)).
  - Shiftbase copies this pattern. Its Minijob contract type derives the hour cap from the wage. Since Aug 2026 it enforces the monthly cap as a **hard limit that includes the previous month's balance**, and its auto-scheduler plans per calendar month ([Shiftbase help](https://help.shiftbase.com/managing-minijob), [release note](https://help.shiftbase.com/-2026-08-19)).
- **On-call work (§12 TzBfG):** if the contract fixes no weekly hours, **20 hours/week are deemed agreed**. Those hours must be paid and count toward the Minijob limit, which at 2026 rates is far above €603 ([Minijob-Zentrale](https://www.minijob-zentrale.de/DE/die-minijobs/arbeitsrechte-im-minijob/arbeit-auf-abruf/detailseite.html), [TK](https://www.tk.de/firmenkunden/fachthemen/versicherung-fachthema/arbeit-auf-abruf-stolperfallen-bei-minijobs-2191168)).
  - Contracts must state the hours. The system should store contracted hours per person.

**Time recording: legal requirement**
- **§17 MiLoG** applies to every employer of Minijobbers except private households. Record **start, end and length** of each day's work **by the end of the 7th calendar day** after the work, and **keep the records at least 2 years**. Any format is accepted. Missing, late or wrong records can be fined ([IHK Pfalz](https://www.ihk.de/pfalz/recht/arbeitsrecht/lohn-und-gehalt/aufzeichnungspflichten-mindestlohngesetz-1273972), [Handelskammer Hamburg](https://www.handelskammer-hamburg.de/recht-steuern/wirtschaftssrecht/arbeitsrecht/dokumentationspflichten-nach-mindeslohngesetz-7007308)).
- **BAG 13.09.2022 (1 ABR 22/21):** every employer must have an objective, reliable and accessible system recording all working time. The legal basis is §3 ArbSchG.
  - A BMAS draft from June/Aug 2026 would require **electronic** recording, with transition periods and exceptions for small businesses. It is **not yet in force** ([Händlerbund](https://ohn.haendlerbund.de/recht/arbeitsrecht/gesetzentwurf-zur-arbeitszeiterfassung-liegt-vor), [IHK Rhein-Neckar](https://www.ihk.de/rhein-neckar/recht/arbeitsrecht/arbeitszeiterfassung-5631422)).
  - Build electronic recording now.
- **ArbZG** (my own legal knowledge, not checked in this research; verify):
  - A break of 30 minutes after 6 hours and 45 minutes after 9 hours.
  - At most 10 hours a day and 11 hours' rest between shifts. This matters for set-up, market day and tear-down.
  - Sunday work at markets is permitted under §10 ArbZG, but §11 requires **at least 15 work-free Sundays a year** and a replacement rest day.

**Payroll export**
- DATEV takes data from time-tracking systems through the **Lohnimportdatenservice**, an ASCII file interface for master and movement data ([DATEV Marktplatz: Crewmeister](https://www.datev.de/web/de/marktplatz/crewmeister), [DATEV Zeitwirtschaft](https://www.datev.de/web/de/steuerberatung/loesungen/komplett-digital-im-lohn/daten-und-dokumente-von-mandanten-erhalten/daten-aus-partner-software-erhalten/effiziente-zeitwirtschaft)).
- **LODAS ASCII import:** a header section (consultant number, client number, separator ";") followed by movement data lines: personnel number; date; amount or hours; wage type number; note. You must address the target table explicitly (for example `u_lod_bwd_buchung_standard`), otherwise the data can end up in "Nachberechnung". The specification is LODAS_SSH.pdf in the LODAS installation ([DATEV community](https://www.datev-community.de/t5/Personalwirtschaft/ASCII-Bewegungsdaten-aus-Drittanbieter-Software-nach-LODAS/m-p/408631)).
- **Practical approach:** generate a CSV plus LODAS ASCII file per month. Wage type numbers per hour type (normal hours, Sunday or public-holiday hours, flat rates) are configured with the tax advisor. A PDF hours list can be signed off.
- Note that social-security contributions are due on the third-last banking day of the **current** month. That is probably why the tax advisor wants data by the 15th. Ask whether the 15th means actual hours for the previous month or a forecast for the current month.

---

## D. Kanban and estimate UX patterns

- **Drag to assign:**
  - Linear swimlanes group the board in rows by assignee, and dragging a card between rows reassigns it ([Linear changelog](https://linear.app/changelog/2024-04-03-swimlanes)).
  - Jira does the same with assignee swimlanes ([Atlassian community](https://community.atlassian.com/forums/Jira-questions/Change-assignee/qaq-p/2497009)).
  - Trello does this through the Swimlanes power-up ([Bluecat](https://www.bluecatreports.com/swimlanes/)). Classic Trello also let you drag a member's avatar onto a card.
  - Asana's workload drill-down lets you drag a task to reassign or reschedule it.
- **Capacity and estimates:**
  - Asana Workload measures effort as task count, hours or points through a custom field, and **turns a person's bar red** when a week's work exceeds their capacity ([Asana](https://asana.com/features/resource-management/workload.md)).
  - monday's Workload widget takes effort from a Time Estimation or number column, and capacity can be set per person. Users report it miscalculates monthly views and spreads effort evenly across weeks ([monday support](https://support.monday.com/hc/en-us/articles/360010699760-The-Workload-View), [community](https://community.monday.com/t/workload-widget-monthly-view-help/115042)).
  - ClickUp's Workload view sums time estimates per person across projects ([ClickUp](https://clickup.com/learn/topic/operations/tools/features/workload-views/)).
- **Carry-over:**
  - Sunsama moves unfinished tasks to the next day **at midnight**, shows a **circled number for consecutive rollover days**, and can auto-archive after N rollovers ([Sunsama](https://help.sunsama.com/docs/task-rollover-and-recurring-tasks-the-basics)).
  - Task Tracker sends WhatsApp reminders for tasks that are overdue.

---

## Recommendations for marktwerk

### 1. WhatsApp architecture, costs and phases

- **Phase 0 (ship now, €0): wa.me plus magic link.**
  1. Assigning a task or shift creates a notification job with a German text and the employee's magic link.
  2. The board shows an "Per WhatsApp senden" button that opens wa.me with the text prefilled, and the manager sends it from the office phone.
  3. Staff confirm or complete on the magic-link page (no login, large buttons: "Zusagen", "Erledigt", "Kann nicht").
  4. Already add an opt-in record and phone number (E.164) to each employee.
- **Phase 1 (about €15/month): Cloud API directly with Meta** (or 360dialog at about €49/month if you want support).
  - Use **Coexistence** to keep the office number, or use a dedicated number plus **Local Storage DE** if data residency matters more.
  - **Utility templates in German:**
    - `aufgabe_zugewiesen`: {{1}} name, {{2}} task, {{3}} market, {{4}} due date. Buttons: Quick reply "Erledigt", Quick reply "Übernehme ich", URL "Details" with `/t/{{token}}`.
    - `schicht_anfrage`: market, role, date and time. Buttons: "Zusagen", "Absagen".
    - `tagesplan`: morning digest.
    - `stunden_monat`: monthly summary or a cap warning to the employee. Keep it neutral and avoid any promotional wording.
  - **Webhook:**
    1. Verify the `X-Hub-Signature-256` header.
    2. Make processing idempotent on the message `id`.
    3. Map the button `payload` (`task:{id}:done`) to the action and write an audit entry.
    4. Show status webhooks (sent / delivered / read / failed) as ticks on the card, read by managers only.
    5. On a "failed" status, fall back to a wa.me button or SMS.
  - Run a send queue with a 3-minute debounce and quiet hours.
  - Budget at the October 2026 German utility rate of €0.0456 per template (verify): even 500 templates a month is about €23.
- Telegram or SMS (seven.io) are optional fallbacks only.

### 2. Shifts, hours and Minijob module

- **Data model:**
  - Employee: contract type (Minijob / Midijob / Werkstudent / Vollzeit), hourly rate, valid-from date, **contracted weekly hours** (to avoid the §12 trap), whether an Arbeitszeitkonto is agreed, fixed monthly pay, preferred roles, and other jobs they declare themselves.
  - Shift: market, role, planned start/end, actual start/end, break, approved by, approved at.
  - **Dated legal parameters table:** minimum wage and Minijob limit with valid-from dates (2026: 13.90 / 603; 2027: 14.60 / 633). Never hard-code these.
- **Team page per person:**
  - Hours and pay this month, worked plus planned.
  - **Remaining allowance**: hours = (limit − earnings) ÷ rate.
  - Total so far this year against €7,236 prorated, plus a 12-month forecast.
  - Count of overrun months in the rolling 12 months.
  - Working-time account balance, where one exists.
- **Warnings:**
  - Amber when the planned month goes over €603 (show "allowed only if annual average OK / unforeseeable").
  - **Red when the month goes over €1,206**, the annual forecast goes over €7,236, or there would be a third overrun month in 12. A red warning should block saving, or require a documented reason.
  - Separately, warn on ArbZG breaches: more than 10 hours a day, less than 11 hours' rest, missing break, and free Sundays used up.
- **"Fill remaining allowance" assistant:**
  - When a market's shifts are created, suggest people who **usually do that role**, ranked by remaining allowance and availability.
  - Send `schicht_anfrage` and fill the slot from the first "Zusagen". Like Deputy, release unanswered requests after a deadline.
- **§17 MiLoG compliance:**
  - Actual times can be entered by the shift lead on site or by the employee via the magic link.
  - An alert fires on day 5 if a past shift still has no actual times. Day 7 is the legal deadline.
  - The record cannot be changed silently: every change is versioned, with a reason.
  - Keep records at least 2 years. Payroll documents may need longer; agree retention with the tax advisor.
  - Export as PDF or CSV for inspections.
- **Month-end close:**
  - Lock the month by about the 10th, approve, then export **CSV plus LODAS ASCII** with the tax advisor's wage type numbers. Remind on the 12th, deadline the 15th.
  - Show a "payroll status" banner listing open shifts that are missing times.

### 3. Kanban with estimates

- **Board per market** with columns by phase (Vorbereitung / Diese Woche / Heute / Erledigt). Add an optional "group by person" swimlane view (Linear-style), where dragging between rows reassigns.
- **People rail:** avatars along the side or top, each with a load bar showing estimated hours this week against the person's capacity. For Minijobbers the capacity is remaining allowance hours.
  - Dropping a card on an avatar assigns it, queues the WhatsApp message and shows an undo toast.
  - The bar turns red when over capacity, as in Asana.
- **Estimates:**
  - Every task has an estimate in minutes, chosen from presets (15m / 30m / 1h / 2h / 4h / 1 day).
  - **Market templates** hold recurring tasks with default estimates.
  - Show totals per market, per person per week, and per year across all markets.
  - **"Hire calculator":** Σ estimated hours ÷ 43 hours per Minijob-month (or FTE hours), giving for example "Markt X ≈ 1.6 Minijobber-Monate". This answers the boss's question directly.
- **Lightweight actual-vs-estimate:**
  - When marking a task "Erledigt", ask one tap: "wie geplant / länger / kürzer", or take the actual time from the shift record.
  - Use the answers to calibrate template defaults over time. Avoid per-task timers.
- **Carry-over:**
  - At midnight, unfinished tasks whose due date has passed move to "Heute" with a rollover badge (↻3, Sunsama-style).
  - After 3 rollovers, flag the task to the manager.
  - Include rolled-over tasks in the morning digest.

### 4. Traps

1. **The October 2026 pricing change.** Utility templates inside the window are no longer free, and service messages are billed beyond 1,000 a month per number. Ignore older blogs.
2. **Template reclassified as marketing.** Keep templates strictly transactional.
3. **Free-form messages fail outside the 24h window.** Always send templates for business-initiated messages.
4. **The number is already in consumer WhatsApp.** Use Coexistence, or migrate the number. Coexistence rules out Local Storage.
5. **No opt-in on record, or forcing the private number.** Get voluntary agreement, offer an alternative path, and involve the works council if there is one. Do not use read ticks to monitor staff.
6. **Hard-coded €603.** It becomes €633 on 1 Jan 2027.
7. **Treating €603 as a hard monthly cap.** That wastes allowance. The annual forecast, the two-month overrun rule and the €1,206 ceiling must be modelled, with documented reasons.
8. **Contracts without fixed hours.** The 20-hour fiction blows the Minijob status.
9. **Missing the 7-day MiLoG recording deadline**, or editing records silently.
10. **Four markets in one weekend.** Watch daily maximum hours, rest periods and free Sundays.
11. **Other Minijobs the employee holds.** They are added together, so ask for a self-declaration.
12. **Notification spam.** Debounce, use digests and respect quiet hours.
13. **Unconfirmed rates and fees.** Check the German rate on Meta's current rate card and the 360dialog fee before quoting the customer.
