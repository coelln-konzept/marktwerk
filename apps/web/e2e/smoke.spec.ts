import { expect, type Page, test } from "@playwright/test";

/** The "Rückgängig" button of a toast (the top bar has its own "Rückgängig: …" button). */
const toastUndo = (page: Page) =>
  page.getByRole("region", { name: "Hinweise" }).getByRole("button", { name: "Rückgängig" });

test("Übersicht loads after login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();
});

test('Übersicht: Heute & überfällig left, the weekend right with a collapsed Top-5 toggle, Diese Woche below; "+ N weitere" opens in place; no KPI or season strip', async ({
  page,
}) => {
  await page.goto("/");
  const weekend = page.getByRole("heading", { level: 2, name: "Dieses Wochenende" });
  const due = page.getByRole("heading", { level: 2, name: "Heute & überfällig" });
  await expect(weekend).toBeVisible();
  await expect(due).toBeVisible();
  const [weekendBox, dueBox] = await Promise.all([weekend.boundingBox(), due.boundingBox()]);
  // Two cards side by side on desktop: Heute & überfällig is the left one (CF9-2), the headings sit on one
  // line (the due header carries count badges, so its heading can be a few px higher than the weekend's).
  expect(dueBox?.x ?? 0).toBeLessThan(weekendBox?.x ?? 0);
  expect(Math.abs((weekendBox?.y ?? 0) - (dueBox?.y ?? 0))).toBeLessThan(24);

  // The weekend's blockers are collapsed behind "Top-N-Aufgaben anzeigen" and show at most 5 rows.
  const toggle = page.getByRole("button", {
    name: /^(Top-\d+-Aufgaben|Wichtigste Aufgabe) anzeigen$/,
  });
  if ((await toggle.count()) > 0) {
    const first = toggle.first();
    const list = page.locator(`[id="${await first.getAttribute("aria-controls")}"]`);
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();
    const rows = await list.locator("li[data-row]").count();
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(5);
    await first.click();
    await expect(list).toBeHidden();
  }

  // "Genehmigungen demnächst" is its own panel in the right column, directly under the weekend (CF9-6).
  const permits = page.getByRole("heading", { level: 2, name: "Genehmigungen demnächst" });
  await expect(permits).toBeVisible();
  const permitsBox = await permits.boundingBox();
  expect(permitsBox?.y ?? 0).toBeGreaterThan(weekendBox?.y ?? 0);
  expect(Math.abs((permitsBox?.x ?? 0) - (weekendBox?.x ?? 0))).toBeLessThan(40);

  // "Diese Woche" (the next 7 days, per market) runs across both columns below them.
  const week = page.getByRole("heading", { level: 2, name: "Diese Woche" });
  await expect(week).toBeVisible();
  const weekBox = await week.boundingBox();
  expect(weekBox?.y ?? 0).toBeGreaterThan(permitsBox?.y ?? 0);
  expect(weekBox?.y ?? 0).toBeGreaterThan(Math.max(weekendBox?.y ?? 0, dueBox?.y ?? 0));
  expect(weekBox?.x ?? 0).toBeLessThan((weekendBox?.x ?? 0) - 100);

  // "+ N weitere" opens the rest in place instead of navigating away.
  const more = page
    .locator("main summary")
    .filter({ hasText: /weitere/ })
    .first();
  if ((await more.count()) > 0) {
    const url = page.url();
    await more.click();
    await expect(more.locator("xpath=..")).toHaveAttribute("open", "");
    expect(page.url()).toBe(url);
  }

  // Every market heading carries a visible eye that opens its Vorschau in place (HN-06).
  const eye = page.getByRole("link", { name: /^Vorschau: / }).first();
  await expect(eye).toBeVisible();
  await eye.click();
  await expect(page).toHaveURL(/[?&]vorschau=/);
  await page.goto("/");

  // No KPI strip (the card headers carry the counts), no season strip, no filter chips, no estimate legend.
  await expect(page.locator('dl[aria-label="Kennzahlen"]')).toHaveCount(0);
  await expect(page.getByText(/^Saison 2026/)).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Filter" })).toHaveCount(0);
  await expect(page.getByText(/Aufwand =/)).toHaveCount(0);
});

test("Übersicht: tasks of past markets are one calm line; Aufräumen skips a market and undoes", async ({
  page,
}) => {
  await page.goto("/");
  const line = page.getByText(/offene Aufgaben? aus vergangenen Märkten/);
  await expect(line).toBeVisible();
  await page.getByRole("link", { name: "Aufräumen", exact: true }).click();
  await expect(page).toHaveURL(/aufraeumen=1/);
  // The drawer is a non-modal dialog labelled by its title.
  const drawer = page.getByRole("dialog", {
    name: "Offene Aufgaben aus vergangenen Märkten",
  });
  await expect(drawer.getByText("Offene Aufgaben aus vergangenen Märkten")).toBeVisible();

  // One row per market (each lists its open tasks as a nested list, so count the rows with a skip button).
  const markets = drawer.getByRole("listitem").filter({
    has: page.getByRole("button", { name: /^Offene Aufgaben von .+ überspringen$/ }),
  });
  const before = await markets.count();
  expect(before).toBeGreaterThan(0);
  await markets
    .first()
    .getByRole("button", { name: /^Offene Aufgaben von .+ überspringen$/ })
    .click();
  await expect(page.getByText(/Aufgaben? von .+ übersprungen/)).toBeVisible();
  await expect(markets).toHaveCount(before - 1);

  // The toast names the market; its undo brings the market back.
  await toastUndo(page).click();
  await expect(markets).toHaveCount(before);

  // The drawer is a linkable page state: a reload keeps it, Esc closes it.
  await page.reload();
  await expect(drawer).toBeVisible();
  // The drawer is server-rendered; its Esc handler needs the page hydrated first.
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/aufraeumen=/);
});

/** The module pages; each has to render with its own heading (owner login, seeded data). */
const MODULE_PAGES = [
  { path: "/board", heading: "Board" },
  { path: "/genehmigungen", heading: "Genehmigungen" },
  { path: "/firma", heading: "Pflichten" },
] as const;

for (const { path, heading } of MODULE_PAGES) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}

/** Team and Finance are hidden in the UI for now (src/lib/modules.ts); their data and services stay. */
test("Team and Finanzen are hidden: no navigation entries, direct visits do not render them", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).first();
  await expect(nav.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Finanzen", exact: true })).toHaveCount(0);

  // The app-wide loading.tsx makes the response stream, so notFound() no longer changes the HTTP status
  // (200); what the page renders is what counts: the German not-found page and none of the module.
  for (const path of ["/team", "/team/stunden", "/finanzen", "/finanzen/neu"]) {
    await page.goto(path);
    // The only h1 is the not-found page's, so no Team/Finanzen content is rendered.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nicht gefunden");
    await expect(page.getByText("Diesen Eintrag gibt es nicht")).toBeVisible();
  }
});

test("Event page: no Team and Geld tabs, Dokumente/Notizen/Verlauf sit under Mehr", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?saison=2026");
  const first = page.locator("tbody tr[data-row]").first();
  const href = (await first.getAttribute("data-href")) as string;
  await page.goto(href);
  const tabs = page.getByRole("navigation", { name: "Bereiche der Veranstaltung" });
  await expect(tabs.getByRole("link", { name: "Checkliste" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: /^Team/ })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: /^Geld/ })).toHaveCount(0);
  // Dokumente, Notizen and Verlauf are not tabs of their own any more.
  await expect(tabs.getByRole("link", { name: /^Notizen/ })).toHaveCount(0);

  // Direct visits to the hidden tabs land on the Überblick.
  for (const tab of ["team", "geld"]) {
    await page.goto(`${href}/${tab}`);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  }
});

test("Event page: the Mehr menu opens Notizen and Dokumente, each on its own URL", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?saison=2026");
  const href = (await page
    .locator("tbody tr[data-row]")
    .first()
    .getAttribute("data-href")) as string;
  await page.goto(href);
  const tabs = page.getByRole("navigation", { name: "Bereiche der Veranstaltung" });
  const more = tabs.getByRole("button", { name: "Mehr" });
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  for (const entry of ["Dokumente", "Notizen"])
    await expect(menu.getByRole("menuitem", { name: new RegExp(`^${entry}`) })).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Notizen/ }).click();
  await expect(page).toHaveURL(new RegExp(`${href}/notizen$`));
  // The menu button is the active tab while a page of the menu is open.
  await expect(tabs.getByRole("button", { name: /^Mehr/ })).toHaveAttribute("aria-current", "page");
});

test('Event page: one "…" menu holds Bearbeiten, Verschieben and Status ändern (keyboard reachable)', async ({
  page,
}) => {
  await page.goto("/veranstaltungen?saison=2026");
  const href = (await page
    .locator("tbody tr[data-row]")
    .first()
    .getAttribute("data-href")) as string;
  await page.goto(href);
  // Health is shown once (Überblick), no separate chip or the old buttons in the header.
  await expect(page.getByRole("button", { name: /^Status ändern/ })).toHaveCount(0);
  await expect(page.locator("header").getByRole("button", { name: /^Buchung/ })).toHaveCount(0);
  await expect(page.getByText("Buchung geschlossen")).toHaveCount(0);

  const trigger = page.getByRole("button", { name: "Weitere Aktionen" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Bearbeiten" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Verschieben" })).toBeVisible();
  await expect(menu.getByText("Status ändern")).toBeVisible();
  await menu.getByRole("menuitem", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("dialog", { name: "Name, Art, Dauer und Ort" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Name, Art, Dauer und Ort" })).toBeHidden();
});

test("Task drawer: Erledigt and Wartet are buttons, the status badge opens every state", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?saison=2026");
  const href = (await page
    .locator("tbody tr[data-row]")
    .first()
    .getAttribute("data-href")) as string;
  await page.goto(href);
  await page.getByRole("heading", { level: 2, name: "Was fehlt" }).waitFor();
  await page.locator("a[href*='aufgabe=']").first().click();
  // The drawer is a non-modal dialog (not a landmark).
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("button", { name: "Erledigt", exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Wartet", exact: true })).toBeVisible();
  // An open task offers no "Wieder öffnen"; that one belongs to finished tasks only.
  await expect(drawer.getByRole("button", { name: "Wieder öffnen" })).toHaveCount(0);
  // The status badge itself opens every status; the current one is marked and can't be picked again.
  await drawer.getByRole("button", { name: /^Status ändern \(jetzt: / }).click();
  const menu = page.getByRole("menu");
  for (const entry of ["Offen", "In Arbeit", "Wartet", "Blockiert", "Übersprungen", "Erledigt"])
    await expect(menu.getByRole("menuitem", { name: entry, exact: true })).toBeVisible();
  // Picking one applies it at once; the badge then names it, and the menu takes it back to Offen.
  await menu.getByRole("menuitem", { name: "In Arbeit", exact: true }).click();
  const badge = drawer.getByRole("button", { name: "Status ändern (jetzt: In Arbeit)" });
  await expect(badge).toBeVisible();
  await badge.click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Offen", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Status ändern (jetzt: Offen)" })).toBeVisible();
  await page.keyboard.press("Escape");
  // The carried-over count and the origin are not shown; the footer hint is gone.
  await expect(drawer.getByText("übertragen")).toHaveCount(0);
  await expect(drawer.getByText("Herkunft")).toHaveCount(0);
  await expect(drawer.getByText("lässt sich als Link weitergeben")).toHaveCount(0);
});

/** The Kalender layers are saved per person: put them back to the defaults ("Zurücksetzen" shows only when they differ). */
async function resetKalenderLayers(page: Page) {
  await page.goto("/kalender");
  await page.waitForLoadState("networkidle"); // hydrated, so the button reacts
  const reset = page.getByRole("button", { name: "Zurücksetzen" });
  if ((await reset.count()) > 0) {
    await reset.click();
    await expect(reset).toHaveCount(0);
  }
}

test("Kalender: Ebenen collapsed by default, two presets, tasks off, full market names", async ({
  page,
}) => {
  await resetKalenderLayers(page); // an earlier run may have left a saved selection
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
  // No breadcrumb above a top-level page: it would only repeat the H1.
  await expect(page.getByRole("navigation", { name: "Brotkrumen" })).toHaveCount(0);

  const toggle = page.getByRole("button", { name: "Ebenen" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("complementary", { name: "Ebenen" });
  await expect(panel).toBeVisible();

  // Permits and obligations on, no tasks layer (user test 2026-11); no disabled "Rückgaben" and no
  // "Nur meine Zuständigkeit".
  await expect(panel.getByRole("checkbox", { name: /Genehmigungen/ })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: /Aufgaben/ })).toHaveCount(0);
  await expect(panel.getByText(/Rückgaben/)).toHaveCount(0);
  await expect(panel.getByText(/Nur meine Zuständigkeit/)).toHaveCount(0);
  // Finance and shift layers are hidden for now.
  for (const layer of ["Raten & Zahlungen", "Schichten"])
    await expect(panel.getByRole("checkbox", { name: new RegExp(layer) })).toHaveCount(0);

  // Two presets only; "Märkte" drops all deadlines.
  await expect(panel.getByRole("button", { name: /^Märkte/ })).toHaveCount(2);
  await panel.getByRole("button", { name: "Märkte", exact: true }).click();
  await expect(page).toHaveURL(/ebenen=1/);
  await expect(panel.getByRole("checkbox", { name: /Genehmigungen/ })).not.toBeChecked();

  // The open state is remembered.
  await page.reload();
  await expect(page.getByRole("button", { name: "Ebenen" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("button", { name: "Ebenen" }).click();

  // Event chips link to the Überblick and show the whole market name.
  await page.goto("/kalender?ebenen=1&typ=flea,antique,city_festival,food_wine");
  const chip = page.locator("table a[href^='/veranstaltungen/']").first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("href", /^\/veranstaltungen\/[0-9a-f-]{36}$/);
  // The title is "<market> · <status>"; the chip shows the whole market name.
  const name = ((await chip.getAttribute("title")) as string).split(" · ")[0] as string;
  expect((await chip.innerText()).replace(/\s+/g, " ").trim()).toContain(name);

  // The list view renders with the same selection.
  await page.goto("/kalender?ansicht=liste");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();

  // The preset click above was saved for the person: leave the defaults behind for the next run.
  await resetKalenderLayers(page);
});

test('Kalender: "+ N weitere" opens the whole day in place; Escape closes it', async ({ page }) => {
  // Find a month with a full day (more than four entries), starting with this one.
  const start = new Date();
  let more = page.getByRole("button", { name: /weitere Einträge? am .* anzeigen$/ }).first();
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await page.goto(`/kalender?ansicht=monat&monat=${month}`);
    more = page.getByRole("button", { name: /weitere Einträge? am .* anzeigen$/ }).first();
    if ((await more.count()) > 0) break;
  }
  test.skip((await more.count()) === 0, "no day with more than four entries in the next 12 months");
  const url = page.url();
  const cell = more.locator("xpath=ancestor::td[1]");
  const shown = await cell.locator("ul > li").count(); // four entries + the button's li
  await more.click();
  const popup = page.getByRole("dialog");
  await expect(popup).toBeVisible();
  expect(await popup.locator("ul > li").count()).toBeGreaterThan(shown - 1);
  await expect(popup.getByRole("link", { name: "In der Liste ab diesem Tag" })).toBeVisible();
  expect(page.url()).toBe(url); // nothing navigated
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(more).toBeFocused();
});

test('Permit: "Als ersetzt markieren" toggles back; the top bar\'s Rückgängig works after the toast is gone', async ({
  page,
}) => {
  // A granted permit (seeded data has many); open its drawer from the Genehmigungen list.
  await page.goto("/genehmigungen?ansicht=liste&zeitraum=alle");
  const row = page.locator("[data-href*='genehmigung=']").filter({ hasText: "Genehmigt" }).first();
  await page.goto((await row.getAttribute("data-href")) as string);
  const drawer = page.locator("aside[aria-labelledby]").last(); // the permit drawer
  const undo = page.getByRole("button", { name: /^Rückgängig: |^Nichts zum Rückgängigmachen$/ });
  await page.waitForLoadState("networkidle");

  await drawer.getByRole("button", { name: "Als ersetzt markieren" }).click();
  const toggle = drawer.getByRole("button", { name: "Als ersetzt markiert" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // Clicking it again makes the permit valid again.
  await toggle.click();
  await expect(page.getByText("Wieder gültig: Genehmigt")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Als ersetzt markieren" })).toBeVisible();

  // Let the toasts go, then undo from the top bar: the permit is superseded again …
  const closeToast = page.getByRole("button", { name: "Hinweis schließen" });
  while ((await closeToast.count()) > 0) await closeToast.first().click();
  await expect(undo).toHaveAccessibleName("Rückgängig: Wieder gültig: Genehmigt (Strg+Z)");
  await undo.click();
  await expect(drawer.getByRole("button", { name: "Als ersetzt markiert" })).toBeVisible();
  // … and once more (the first change), back to Genehmigt: the history holds both.
  await undo.click();
  await expect(drawer.getByRole("button", { name: "Als ersetzt markieren" })).toBeVisible();
});

test("Veranstaltungen: sortable columns, the Ort chip filters, the row menu edits the type too", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?status=alle");
  const names = () => page.locator("tbody tr[data-row] td:nth-child(3) a").allInnerTexts();

  // Name ascending, then descending; month headers only when sorted by date.
  await page.getByRole("columnheader", { name: "Veranstaltung" }).getByRole("link").click();
  await expect(page).toHaveURL(/sortierung=name/);
  const asc = await names();
  expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, "de")));
  await expect(page.getByRole("columnheader", { name: "Veranstaltung" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await page.getByRole("columnheader", { name: "Veranstaltung" }).getByRole("link").click();
  await expect(page).toHaveURL(/richtung=ab/);
  await expect(page.getByRole("columnheader", { name: "Veranstaltung" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  // The Ort chip narrows the list to that venue and shows as a removable filter.
  const chip = page.locator('a[title^="Nur Veranstaltungen an"]').first();
  const venue = ((await chip.getAttribute("title")) as string).match(/„(.+)“/)?.[1] as string;
  await chip.click();
  await expect(page).toHaveURL(/[?&]ort=/);
  const venues = await page.locator("tbody tr[data-row] td:nth-child(5)").allInnerTexts();
  expect(venues.length).toBeGreaterThan(0);
  for (const v of venues) expect(v.trim()).toBe(venue);

  // The row's "…" menu holds Bearbeiten; the dialog has the type, with the hint when it changes.
  await page.waitForLoadState("networkidle");
  await page.locator("tbody tr[data-row]").first().hover();
  await page
    .getByRole("button", { name: /^Weitere Aktionen für / })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  const dialog = page.getByRole("dialog", { name: "Name, Art, Dauer und Ort" });
  const type = dialog.getByLabel("Art");
  await expect(type).toBeVisible();
  const other = await type.locator("option:not(:checked)").first().getAttribute("value");
  await type.selectOption(other as string);
  await expect(dialog.getByText("Aufgaben und Genehmigungen bleiben, wie sie sind.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Markt planen: Saturday and Sunday picked become one two-day event (switchable)", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?erzeugen=1");
  await page.waitForLoadState("networkidle");
  const sheet = page.getByRole("dialog");
  await sheet
    .getByRole("radio", { name: /Flohmarkt/ })
    .first()
    .check();
  await sheet.getByRole("button", { name: "Weiter" }).click();
  await sheet.getByRole("button", { name: "Einzeln anklicken" }).click();
  // Start from nothing picked, then pick one Saturday and the Sunday after it.
  const picked = sheet.locator("button[data-day][aria-pressed=true]");
  while ((await picked.count()) > 0) await picked.first().click();
  const sat = sheet.locator("button[data-day][aria-label^='Sa ']:not([disabled])").nth(5);
  const day = (await sat.getAttribute("data-day")) as string;
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  await sat.click();
  await sheet.locator(`button[data-day='${next.toISOString().slice(0, 10)}']`).click();

  const merge = sheet.getByRole("checkbox", { name: /Aufeinanderfolgende Tage/ });
  await expect(merge).toBeChecked();
  await expect(sheet.getByText("wird 1 Veranstaltung")).toBeVisible();
  await sheet.getByRole("button", { name: "Weiter" }).click();
  await expect(sheet.getByRole("button", { name: "1 Veranstaltung anlegen" })).toBeVisible();
  // Switched off, the two days are two events again.
  await sheet.getByRole("button", { name: "Zurück" }).click();
  await merge.uncheck();
  await sheet.getByRole("button", { name: "Weiter" }).click();
  await expect(sheet.getByRole("button", { name: "2 Veranstaltungen anlegen" })).toBeVisible();
});

test("Archiv: past events only, newest first; Als Vorlage speichern opens the prefilled market form", async ({
  page,
}) => {
  await page.goto("/archiv");
  await expect(page).toHaveURL(/\/archiv\/veranstaltungen$/);
  await expect(page.getByRole("heading", { level: 1, name: "Archiv" })).toBeVisible();
  const sections = page.getByRole("group", { name: "Archivbereich" });
  for (const name of ["Vergangene Veranstaltungen", "Dokumente", "Aktivität", "Alte Genehmigungen"])
    await expect(sections.getByRole("link", { name })).toBeVisible();

  // Only events that are over (the query is covered by an integration test); there are some in the seed.
  await expect(page.getByText(/^\d+ vergangene Veranstaltungen?$/)).toBeVisible();
  await expect(page.locator("tbody tr[data-row]").first()).toBeVisible();

  await page.waitForLoadState("networkidle");
  const save = page.getByRole("link", { name: /als Vorlage speichern$/ }).first();
  const name = ((await save.getAttribute("aria-label")) as string).match(/„(.+)“/)?.[1] as string;
  await save.click();
  const dialog = page.getByRole("dialog", { name: "Als Vorlage speichern" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
  await dialog.getByRole("button", { name: "Abbrechen" }).last().click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/vorlage=/);
});

test("Archiv: 50 rows per page with a pager; Aktivität, Alte Genehmigungen and Dokumente render", async ({
  page,
}) => {
  await page.goto("/archiv/veranstaltungen");
  const pager = page.getByRole("navigation", { name: "Seiten" });
  await expect(page.locator("tbody tr[data-row]")).toHaveCount(50);
  await expect(pager.getByText(/^1–50 von \d+$/)).toBeVisible();
  await pager.getByRole("link", { name: "Nächste Seite" }).click();
  await expect(page).toHaveURL(/seite=2/);
  await expect(pager.getByRole("link", { name: "Seite 2" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goto("/archiv/aktivitaet");
  await expect(page.getByRole("columnheader", { name: "Änderung" })).toBeVisible();
  await page.waitForLoadState("networkidle"); // the select submits on change once hydrated
  await page.getByLabel("Bereich", { exact: true }).selectOption("permit");
  await expect(page).toHaveURL(/bereich=permit/);

  await page.goto("/archiv/genehmigungen");
  const row = page.locator("tbody tr[data-row]").first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/genehmigung=/);

  await page.goto("/archiv/dokumente");
  await expect(page.getByPlaceholder("Dateiname oder Beschreibung")).toBeVisible();
});

test("Ort page: events and markets are the first two boxes; Alle Veranstaltungen opens the filtered list", async ({
  page,
}) => {
  await page.goto("/orte");
  await page.locator("tbody tr[data-href]").first().click();
  await expect(page).toHaveURL(/\/orte\/[0-9a-f-]{36}$/);
  const events = page.getByRole("heading", { name: /^Veranstaltungen an diesem Ort/ });
  const markets = page.getByRole("heading", { name: /^Märkte an diesem Ort/ });
  const address = page.getByRole("heading", { name: "Adresse & Zufahrt" });
  await expect(events).toBeVisible();
  await expect(markets).toBeVisible();
  // Above the address and zones.
  expect((await events.boundingBox())?.y ?? 0).toBeLessThan((await address.boundingBox())?.y ?? 0);
  await page.getByRole("link", { name: "Alle Veranstaltungen" }).click();
  await expect(page).toHaveURL(/\/veranstaltungen\?ort=[0-9a-f-]{36}&status=alle/);
});

test("Event Genehmigungen tab: add a permit for this event (undo removes it) and a task", async ({
  page,
}) => {
  await page.goto("/veranstaltungen");
  const href = await page.locator("tbody tr[data-href]").first().getAttribute("data-href");
  await page.goto(`${href}/genehmigungen`);
  await page.waitForLoadState("networkidle");
  // The task button starts in the category Genehmigungen and has no C hint (C stays "+ Neu").
  await expect(page.getByRole("button", { name: "Aufgabe", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Aufgabe", exact: true }).click();
  const taskDialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
  await expect(taskDialog.getByLabel("Kategorie")).toHaveValue("permits");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Genehmigung anlegen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Ort")).toBeDisabled();
  const title = `E2E Lärmschutz ${Date.now()}`;
  await dialog.getByLabel("Bezeichnung").fill(title);
  await dialog.getByRole("button", { name: "Anlegen", exact: true }).click();
  // It opens in this tab's drawer and is listed for this event.
  await expect(page).toHaveURL(/\/genehmigungen\?genehmigung=/);
  await expect(page.locator("tbody").getByText(title)).toBeVisible();
  await toastUndo(page).click();
  await expect(page.locator("tbody").getByText(title)).toHaveCount(0);
});

test("Sidebar: four daily entries (no Board), Stammdaten collapsed and remembered, Einstellungen in the profile menu", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).first();
  for (const entry of ["Übersicht", "Veranstaltungen", "Kalender", "Genehmigungen"])
    await expect(nav.getByRole("link", { name: new RegExp(`^${entry}`) })).toBeVisible();
  // Gone: Board, Logbuch, the "Später" group, Benachrichtigungen, Einstellungen, Firma.
  for (const entry of [
    "Board",
    "Logbuch",
    "Buchungen",
    "Postfach",
    "Inventar",
    "Benachrichtigungen",
    "Einstellungen",
    "Firma",
  ])
    await expect(nav.getByRole("link", { name: entry, exact: true })).toHaveCount(0);

  const group = nav.getByRole("button", { name: "Stammdaten" });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Orte", exact: true })).toBeHidden();
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  for (const entry of ["Orte", "Kontakte", "Aussteller", "Wissen", "Archiv", "Pflichten"])
    await expect(nav.getByRole("link", { name: entry, exact: true })).toBeVisible();

  // Remembered across a reload.
  await page.reload();
  await expect(nav.getByRole("button", { name: "Stammdaten" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await nav.getByRole("link", { name: "Pflichten", exact: true }).click();
  await expect(page).toHaveURL(/\/firma\/pflichten$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pflichten" })).toBeVisible();

  // Einstellungen: profile menu (bottom left).
  await page.getByRole("button", { name: /Geschäftsführung/ }).click();
  await page.getByRole("menuitem", { name: "Einstellungen" }).click();
  await expect(page).toHaveURL(/\/einstellungen\/firma$/);
});

test("Logbuch became Genehmigungen: /logbuch redirects with the drawer link intact", async ({
  page,
}) => {
  const response = await page.goto("/logbuch");
  await expect(page).toHaveURL(/\/genehmigungen$/);
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1, name: "Genehmigungen" })).toBeVisible();

  // One status row; the focus chip's number is the sidebar badge.
  const filters = page.getByRole("group", { name: "Status" });
  await expect(filters).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Fokus" })).toHaveCount(0);
  const focus = filters.getByRole("link", { name: /Jetzt zu tun/ });
  const chipCount = (await focus.innerText()).match(/(\d+)\s*$/)?.[1];
  const badge = page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .first()
    .getByRole("link", { name: /^Genehmigungen/ });
  if (chipCount && chipCount !== "0") await expect(badge).toContainText(chipCount);

  // Sub-paths and the drawer query keep working.
  await page.goto("/logbuch?ansicht=liste&genehmigung=00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/genehmigungen\?ansicht=liste&genehmigung=/);
});

test("Benachrichtigungen: no bell, the page stays; filters, Erledigt and Zurückstellen with undo, J/K", async ({
  page,
}) => {
  // Needs the seeded database after one deadline sweep (docs/development/testing.md).
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // No sidebar entry and no bell (user test 2026-11); the page is still reachable by URL and Strg+K.
  await expect(
    page.getByRole("navigation").getByRole("link", { name: /^Benachrichtigungen/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Benachrichtigungen/ })).toHaveCount(0);

  await page.goto("/benachrichtigungen");
  await expect(page.getByRole("heading", { level: 1, name: "Benachrichtigungen" })).toBeVisible();

  const status = page.getByRole("group", { name: "Status" });
  const open = async () => Number(/Offen (\d+)/.exec(await status.innerText())?.[1]);
  const before = await open();
  expect(before).toBeGreaterThan(0);

  // Filters live in the URL: Art, Sortierung.
  const art = page.getByRole("group", { name: "Art" });
  await art.getByRole("link", { name: /^Aufgaben/ }).click();
  await expect(page).toHaveURL(/art=tasks/);
  await art.getByRole("link", { name: /^Alle/ }).click();
  await expect(page).not.toHaveURL(/art=/);
  await page
    .getByRole("group", { name: "Sortierung" })
    .getByRole("link", { name: "Neueste" })
    .click();
  await expect(page).toHaveURL(/sortierung=newest/);
  await page
    .getByRole("group", { name: "Sortierung" })
    .getByRole("link", { name: "Dringlichkeit" })
    .click();
  await expect(page).not.toHaveURL(/sortierung=/);

  // J/K and Enter on rows.
  const rows = page.locator("li[data-row]");
  await rows.first().focus();
  await page.keyboard.press("j");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("k");
  await expect(rows.first()).toBeFocused();

  // Erledigt on a task asks first (it leaves the list, decision D1): Abbrechen changes nothing.
  const task = page.locator("li[data-row][data-task]").first();
  const confirm = page.getByRole("dialog", { name: "Aufgabe erledigt?" });
  await task.getByRole("button", { name: "Erledigt", exact: true }).click();
  await confirm.getByRole("button", { name: "Abbrechen" }).last().click();
  await expect(confirm).toBeHidden();
  expect(await open()).toBe(before);
  // Confirmed, it completes the task (own undo toast); the notification resolves with it.
  await task.getByRole("button", { name: "Erledigt", exact: true }).click();
  await confirm.getByRole("button", { name: "Ja, erledigt" }).click();
  await expect(toastUndo(page)).toBeVisible();
  await expect.poll(open).toBe(before - 1);
  await toastUndo(page).click();
  await expect.poll(open).toBe(before);

  // Zurückstellen (in the "…" menu) with a preset moves it to "Zurückgestellt"; undo brings it back.
  await rows
    .first()
    .getByRole("button", { name: /^Weitere Aktionen/ })
    .click();
  await page.getByRole("menuitem", { name: /^Morgen/ }).click();
  await expect(page.getByText(/zurückgestellt bis/).first()).toBeVisible();
  await expect.poll(open).toBe(before - 1);
  await expect(status).toContainText(/Zurückgestellt 1/);
  await toastUndo(page).click();
  await expect.poll(open).toBe(before);

  // The tab "Zurückgestellt" shows the empty state when nothing is snoozed.
  await status.getByRole("link", { name: /^Zurückgestellt/ }).click();
  await expect(page.getByText("Nichts zurückgestellt.")).toBeVisible();
});

test("+ Neu offers task, permit and defect to the owner (no payment or shift while hidden)", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // hydrated, so the button reacts
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  const menu = page.getByRole("menu");
  // The entry that fits the page comes first: on the Übersicht that is the event (Markt planen).
  for (const entry of ["Aufgabe", "Genehmigung", "Mangel melden"])
    await expect(menu.getByRole("menuitem", { name: entry })).toBeVisible();
  for (const entry of ["Zahlung", "Schicht"])
    await expect(menu.getByRole("menuitem", { name: entry })).toHaveCount(0);
  await expect(menu.getByRole("menuitem").first()).toHaveText("Markt planen");

  // "Aufgabe" opens the quick-create dialog on the Übersicht (the global Board is hidden), with the event to
  // pick; Esc closes it and cleans the URL.
  await menu.getByRole("menuitem", { name: "Aufgabe" }).click();
  await expect(page).toHaveURL(/\/\?neu=1$/);
  const dialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Veranstaltung")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/$/);

  // Strg+K "Aufgabe anlegen" leads to the same dialog.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Aufgabe anlegen");
  await page
    .getByRole("option", { name: /Aufgabe anlegen/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Neue Aufgabe" })).toBeVisible();
});

test("Veranstaltungen: Space previews a row, Enter opens it, back returns to the list", async ({
  page,
}) => {
  // The seed holds 2026 and 2027; pin the season so the test does not depend on the current date.
  await page.goto("/veranstaltungen?saison=2026");
  await expect(page.getByRole("heading", { level: 1, name: "Veranstaltungen" })).toBeVisible();

  const rows = page.locator("tbody tr[data-row]");
  await expect(rows.first()).toBeVisible();
  const first = rows.first();
  const href = await first.getAttribute("data-href");
  expect(href).toMatch(/^\/veranstaltungen\/[0-9a-f-]{36}$/);
  const name = (await first.getByRole("link").first().innerText()).trim();

  // Space: the Vorschau card opens, URL-driven.
  await first.focus();
  await page.keyboard.press("Space");
  const vorschau = page.getByRole("dialog", { name });
  await expect(vorschau).toBeVisible();
  await expect(page).toHaveURL(/[?&]vorschau=/);
  await expect(vorschau.getByRole("link", { name: "Öffnen" })).toBeVisible();

  // Esc closes it again.
  await page.keyboard.press("Escape");
  await expect(vorschau).toBeHidden();
  await expect(page).not.toHaveURL(/vorschau=/);

  // The “Öffnen” button of the Vorschau goes to the event page.
  await first.focus();
  await page.keyboard.press("Space");
  await vorschau.getByRole("link", { name: "Öffnen" }).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Veranstaltungen" })).toBeVisible();

  // Enter on a focused row opens the event page directly.
  await rows.first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(rows.first()).toBeVisible();
});

test("command palette: Ctrl+K finds Köln by typing “koln”", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The Übersicht is a long page: wait until it is hydrated, or the shortcut has no listener yet.
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox");
  await expect(input).toBeVisible();
  await input.fill("koln");
  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("option").first()).toBeVisible();
  await expect(listbox.getByRole("option", { name: /Köln/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("Board: a card moves to the next column with the keyboard (grip, Space, →, Space) and back with Rückgängig", async ({
  page,
}) => {
  await page.goto("/board?ansicht=spalten&tab=alle&zeitraum=alle");
  await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();

  const from = page.getByRole("region", { name: "Später" });
  const to = page.getByRole("region", { name: "Diese Woche" });
  const card = from.locator("[data-card]").first();
  await expect(card).toBeVisible();
  const id = await card.getAttribute("data-card");
  expect(id).toBeTruthy();

  const grip = page.locator(`[data-grip="${id}"]`);
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status").filter({ hasText: "aufgenommen" }).first()).toBeVisible();
  // Columns run most urgent first, so "Diese Woche" is the column to the left of "Später".
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");

  // Optimistic: the card shows up in the neighbouring column at once; the undo toast offers to revert.
  // Long columns show 30 cards before "weitere anzeigen" and the card is sorted in by date, so open the
  // rest of the column until it is there (the seed grows with the date, so "Diese Woche" can hold more).
  const moved = to.locator(`[data-card="${id}"]`);
  const more = to.getByRole("button", { name: /weitere anzeigen/ });
  await expect(moved.or(more).first()).toBeVisible();
  while ((await moved.count()) === 0 && (await more.count()) > 0) await more.first().click();
  await expect(moved).toBeVisible();
  await expect(from.locator(`[data-card="${id}"]`)).toHaveCount(0);
  await toastUndo(page).click();
  await expect(from.locator(`[data-card="${id}"]`)).toBeVisible();
});

test("Board: two views, the category filter sits behind Filter, no Team/Finanzen chips", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle&ansicht=gruppiert");
  const views = page.getByRole("group", { name: "Ansicht" });
  // "Gruppiert" is gone; an old link falls back to Bereitschaft.
  // No Matrix while Kernaufgaben are hidden (user test 2026-11).
  await expect(views.getByRole("link")).toHaveText(["Bereitschaft", "Spalten"]);
  await expect(views.getByRole("link", { name: "Bereitschaft" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.getByText("Aufgaben über alle Veranstaltungen")).toHaveCount(0);

  const filter = page.getByText("Filter", { exact: true });
  const chips = page.getByRole("group", { name: "Kategorie" });
  await expect(chips).toBeHidden();
  await filter.click();
  await expect(chips).toBeVisible();
  await expect(chips.getByRole("link", { name: /^Team/ })).toHaveCount(0);
  await expect(chips.getByRole("link", { name: /^Finanzen/ })).toHaveCount(0);
  await chips.getByRole("link", { name: /^Genehmigungen/ }).click();
  await expect(page).toHaveURL(/kategorie=permits/);
  await expect(page.getByText(/Filter: Genehmigungen/)).toBeVisible();
});

test("Board: Bereitschaft is the default view, one row per market linking to its Überblick", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle");
  await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();
  const views = page.getByRole("group", { name: "Ansicht" });
  await expect(views.getByRole("link", { name: "Bereitschaft" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  const table = page.getByRole("table", { name: "Bereitschaft der kommenden Veranstaltungen" });
  await expect(table.getByRole("columnheader", { name: "Nächste Frist" })).toBeVisible();
  const market = table.locator("tbody tr").first().getByRole("link").first();
  await expect(market).toBeVisible();
  await expect(market).toHaveAttribute("href", /\/veranstaltungen\/[^/]+$/);
});

test("Board: an old Matrix link falls back to Bereitschaft while Kernaufgaben are hidden", async ({
  page,
}) => {
  await page.goto("/board?ansicht=matrix&zeitraum=alle");
  await expect(
    page.getByRole("table", { name: "Bereitschaft der kommenden Veranstaltungen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Kernaufgaben der kommenden Veranstaltungen" }),
  ).toHaveCount(0);
});

test("command palette finds tasks, permits and vehicles by their titles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The Übersicht is a long page: wait until it is hydrated, or the shortcut has no listener yet.
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox");
  await input.fill("genehmigung");
  const listbox = page.getByRole("listbox");
  // Hits are grouped by kind; at least one group other than actions answers.
  await expect(listbox.getByRole("group").first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Markt planen: the market list offers 'Neuen Markt anlegen'; no Vorlagen entry in the sidebar", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?saison=2026");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).first();
  await expect(nav.getByRole("link", { name: "Vorlagen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Einzeltermin" })).toHaveCount(0);

  await page.getByRole("link", { name: "Markt planen" }).click();
  const sheet = page.getByRole("dialog", { name: "Markt planen" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/erzeugen=1/);
  await expect(sheet.getByRole("button", { name: /Neuen Markt anlegen/ })).toBeVisible();
  await expect(sheet.getByRole("searchbox")).toBeVisible();
});

test("Veranstaltungen: opens at the current week (past ones one select away), no Liste/Kalender toggle", async ({
  page,
}) => {
  await page.goto("/veranstaltungen");
  await expect(page.getByRole("heading", { level: 1, name: "Veranstaltungen" })).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("aktuell");
  await expect(page.getByRole("group", { name: "Ansicht" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Zustand" })).toHaveCount(0);
  // "abgerechnet" is not a separate state while finance is hidden.
  await expect(page.getByLabel("Status").locator("option", { hasText: "abgerechnet" })).toHaveCount(
    0,
  );
});

test("Veranstaltung Zusammenfassung: shows Was fehlt, no Kernaufgaben and no Zustand panel", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?saison=2026");
  const href = await page.locator("tbody tr[data-row]").first().getAttribute("data-href");
  expect(href).toMatch(/^\/veranstaltungen\/[0-9a-f-]{36}$/);
  await page.goto(href as string);
  await expect(page.getByRole("heading", { level: 2, name: "Was fehlt" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Kernaufgaben" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Zustand" })).toHaveCount(0);
});

test("Whole rows open their target: a click beside the market name opens the event Überblick", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle");
  const row = page
    .getByRole("table", { name: "Bereitschaft der kommenden Veranstaltungen" })
    .locator("tbody tr[data-href]")
    .first();
  const href = await row.getAttribute("data-href");
  // The progress cell has no link of its own.
  await row.locator("td").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test("Back arrow: returns to the page you came from with its filters, else to the parent page", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle");
  const back = page.getByRole("button", { name: "Zurück", exact: true });
  await expect(back).toHaveCount(0);
  await page
    .getByRole("table", { name: "Bereitschaft der kommenden Veranstaltungen" })
    .locator("tbody tr")
    .first()
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/veranstaltungen\/[0-9a-f-]{36}$/);
  const event = page.url();
  await back.click();
  await expect(page).toHaveURL(/\/board\?zeitraum=alle$/);

  // Opened directly (new tab): back goes to the parent crumb.
  const direct = await page.context().newPage();
  await direct.goto(event);
  await direct.getByRole("button", { name: "Zurück", exact: true }).click();
  await expect(direct).toHaveURL(/\/veranstaltungen$/);
});

test("Übersicht: Erledigt asks first, since the task leaves the list; Abbrechen keeps it", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const tick = page.getByRole("button", { name: /als erledigt markieren$/ }).first();
  const label = await tick.getAttribute("aria-label");
  await tick.click();
  const confirm = page.getByRole("dialog", { name: "Aufgabe erledigt?" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("als erledigt markieren?");
  await confirm.getByRole("button", { name: "Abbrechen" }).last().click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("button", { name: label ?? "" })).toBeVisible();
  await expect(toastUndo(page)).toHaveCount(0);
});

test("Event Checkliste: every task by phase, one line each; ticked rows stay crossed out and untick", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle");
  const href = await page.locator("tbody tr[data-href]").first().getAttribute("data-href");
  // An old Spalten link lands on the Checkliste; there is no view switch left.
  await page.goto(`${href}/board?ansicht=spalten`);
  await expect(page.getByRole("group", { name: "Ansicht" })).toHaveCount(0);
  const rows = page.locator("li[data-row]");
  await expect(rows.first()).toBeVisible();
  // Phase headers carry a count; finished tasks stay in their phase, no collapsed "Erledigt" group.
  await expect(page.locator("main h2").first()).toContainText(/Aufgaben?$|erledigt$/);
  await expect(
    page.locator("main details").filter({ has: page.locator("summary", { hasText: /^Erledigt/ }) }),
  ).toHaveCount(0);
  // Single-line rows on desktop: much shorter than the 130 px cards.
  const box = await rows.first().boundingBox();
  expect(box?.height ?? 0).toBeLessThan(56);

  // Tick an open row: it stays where it is, crossed out, and the same button unticks it.
  const row = rows.filter({ has: page.locator('button[aria-pressed="false"]') }).first();
  const title = (await row.locator("a").first().textContent()) ?? "";
  await page.waitForLoadState("networkidle");
  await row.locator("button[aria-pressed]").click();
  const same = rows.filter({ has: page.getByRole("link", { name: title, exact: true }) }).first();
  await expect(same.locator("button[aria-pressed]")).toHaveAttribute("aria-pressed", "true");
  await expect(same.locator("a").first()).toHaveCSS("text-decoration-line", "line-through");
  await same.locator("button[aria-pressed]").click();
  await expect(same.locator("button[aria-pressed]")).toHaveAttribute("aria-pressed", "false");

  await rows.first().locator("span").nth(2).click();
  await expect(page).toHaveURL(/aufgabe=/);
});

test("Task drawer: Erledigt is a toggle, pressed while done; a second click reopens", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle");
  const href = await page.locator("tbody tr[data-href]").first().getAttribute("data-href");
  await page.goto(`${href}/board`);
  const rows = page.locator("li[data-row]");
  const row = rows.filter({ has: page.locator('button[aria-pressed="false"]') }).first();
  const title = (await row.locator("a").first().textContent()) ?? "";
  await page.waitForLoadState("networkidle");
  // Tick it in the list (same tick everywhere), then open it.
  await row.locator("button[aria-pressed]").click();
  const same = rows.filter({ has: page.getByRole("link", { name: title, exact: true }) }).first();
  await expect(same.locator("button[aria-pressed]")).toHaveAttribute("aria-pressed", "true");
  await same.locator("a").first().click();
  const drawer = page.getByRole("dialog");
  const toggle = drawer.getByRole("button", { name: `„${title}“ wieder öffnen` });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toContainText("Erledigt");
  await toggle.click();
  const reopened = drawer.getByRole("button", { name: "Erledigt", exact: true });
  await expect(reopened).toHaveAttribute("aria-pressed", "false");
  await expect(drawer.getByRole("button", { name: "Wartet", exact: true })).toBeVisible();
});

test("Verlauf: Wiederherstellen reopens a task ticked off on the Checkliste", async ({ page }) => {
  await page.goto("/board?zeitraum=alle");
  const href = await page.locator("tbody tr[data-href]").first().getAttribute("data-href");
  await page.goto(`${href}/board`);
  await page.waitForLoadState("networkidle");
  const row = page
    .locator("li[data-row]")
    .filter({ has: page.locator('button[aria-pressed="false"]') })
    .first();
  const title = ((await row.locator("a").first().textContent()) ?? "").trim();
  await row.locator("button[aria-pressed]").click();
  await expect(toastUndo(page)).toBeVisible();

  await page.goto(`${href}/verlauf`);
  await page.waitForLoadState("networkidle");
  const restore = page.getByRole("button", { name: `„${title}“ wiederherstellen (wieder offen)` });
  await expect(restore.first()).toBeVisible();
  await restore.first().click();
  await expect(page.getByText(`„${title}“ wieder geöffnet`)).toBeVisible();
  await expect(restore).toHaveCount(0);
});

test("Sidebar: the button at its top right hides it (remembered), the top bar brings it back", async ({
  page,
}) => {
  await page.goto("/board");
  await page.waitForLoadState("networkidle"); // hydrated, so the buttons react
  // The sidebar container is a labelled complementary landmark (a dialog on phones).
  const nav = page.getByRole("complementary", { name: "Hauptnavigation" });
  await expect(nav).toBeVisible();
  await page.getByRole("button", { name: "Seitenleiste ausblenden" }).click();
  await expect(nav).toBeHidden();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Seitenleiste einblenden" }).click();
  await expect(nav).toBeVisible();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(nav).toBeVisible();
});

test('"+ Neu" › Termin: name and today, saved with a toast; the dialog closes and the URL is clean', async ({
  page,
}) => {
  await page.goto("/kalender");
  await page.waitForLoadState("networkidle"); // hydrated, so the key and the menu react
  await page.keyboard.press("c");
  await page.getByRole("menuitem", { name: "Termin", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Termin anlegen" });
  await expect(dialog).toBeVisible();
  const name = `E2E-Termin ${Date.now()}`;
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await expect(dialog.getByLabel("Datum")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText("Termin angelegt")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/neu=termin/);
  await toastUndo(page).click(); // leaves no appointment behind
  await expect(page.getByText("Termin entfernt")).toBeVisible();
});

test("Kalender: a day's + opens the Termin dialog with that date", async ({ page }) => {
  await page.goto("/kalender?monat=2027-03");
  await page.waitForLoadState("networkidle");
  const add = page.getByRole("link", { name: /^Termin am .*15\.03\.2027 anlegen$/ });
  await add.focus(); // visible on focus, not only on hover
  await add.click();
  await expect(page).toHaveURL(/neu=termin&datum=2027-03-15/);
  await expect(
    page.getByRole("dialog", { name: "Termin anlegen" }).getByLabel("Datum"),
  ).toHaveValue("2027-03-15");
});

test("Termin: appears in the Kalender (Monat and Liste) and under Termine heute; its Vorschau shows the contact; archiving has an undo", async ({
  page,
}) => {
  const name = `E2E-Termin ${Date.now()}`;
  await page.goto("/?neu=termin");
  const dialog = page.getByRole("dialog", { name: "Termin anlegen" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).first().fill(name);
  await dialog.getByRole("button", { name: "Neuer Kontakt …" }).click();
  await dialog.getByLabel("Name", { exact: true }).nth(1).fill("Frau E2E-Kontakt");
  await dialog.getByLabel("Telefon").fill("+49 221 1234567");
  await dialog.getByLabel("E-Mail").fill("e2e.kontakt@example.com");
  await dialog.getByLabel("Als Kontakt speichern").uncheck(); // stays on the Termin, no Kontakte entry left over
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText("Termin angelegt")).toBeVisible();
  await expect(dialog).toBeHidden();

  // Übersicht: first group of "Heute & überfällig", all-day Termine first.
  const group = page.getByRole("region", { name: "Termine heute" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("link", { name })).toBeVisible();

  // Kalender: the Liste shows it today; its Vorschau has the contact as tel: and mailto: links.
  await page.goto("/kalender?ansicht=liste");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name }).click();
  const vorschau = page.getByRole("dialog", { name });
  await expect(vorschau).toBeVisible();
  await expect(vorschau.getByText("Frau E2E-Kontakt")).toBeVisible();
  await expect(vorschau.getByRole("link", { name: "+49 221 1234567" })).toHaveAttribute(
    "href",
    "tel:+492211234567",
  );
  await expect(vorschau.getByRole("link", { name: "e2e.kontakt@example.com" })).toHaveAttribute(
    "href",
    "mailto:e2e.kontakt@example.com",
  );

  // Monat: the chip is in today's cell (the Vorschau URL keeps the view).
  await page.goto("/kalender");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();

  // Archive from the Vorschau: gone from the Übersicht, back with the undo.
  await page.goto("/?vorschau=termin:" + (await termId(page, name)));
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Archivieren" }).click();
  await expect(page.getByText("Termin archiviert")).toBeVisible();
  await expect(group.getByRole("link", { name })).toHaveCount(0);
  await toastUndo(page).click();
  await expect(page.getByText("Termin wiederhergestellt")).toBeVisible();
  await expect(group.getByRole("link", { name })).toBeVisible();

  // Leave nothing behind.
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Archivieren" }).click();
  await expect(page.getByText("Termin archiviert")).toBeVisible();
});

/** The id of a Termin, read from its link in the Übersicht's "Termine heute" group. */
async function termId(page: Page, name: string): Promise<string> {
  await page.goto("/");
  const href = await page
    .getByRole("region", { name: "Termine heute" })
    .getByRole("link", { name })
    .getAttribute("href");
  return (href ?? "").split("termin:")[1] ?? "";
}
