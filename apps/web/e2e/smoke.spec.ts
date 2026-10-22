import { expect, test } from "@playwright/test";

test("Übersicht loads after login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();
});

test("Übersicht: Heute fällig with filter chips, KPI strip and the weekend table", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Heute fällig" })).toBeVisible();
  const chips = page.getByRole("group", { name: "Filter" });
  await expect(chips.getByRole("link", { name: /^Alle/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Dieses Wochenende" })).toBeVisible();
  await expect(page.locator('dl[aria-label="Kennzahlen"]')).toBeVisible();

  // A chip filters the list; the state lives in the URL.
  const chip = chips.getByRole("link").nth(1);
  if (await chip.isVisible()) {
    await chip.click();
    await expect(page).toHaveURL(/faellig=/);
    await expect(page.getByRole("heading", { level: 2, name: "Heute fällig" })).toBeVisible();
  }
});

/** The module pages; each has to render with its own heading (owner login, seeded data). */
const MODULE_PAGES = [
  { path: "/board", heading: "Board" },
  { path: "/logbuch", heading: "Logbuch" },
  { path: "/firma", heading: "Firma" },
  { path: "/benachrichtigungen", heading: "Benachrichtigungen" },
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

  for (const path of ["/team", "/team/stunden", "/finanzen", "/finanzen/neu"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
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
  await expect(tabs.getByRole("link", { name: "Board" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: /^Team/ })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: /^Geld/ })).toHaveCount(0);
  // Dokumente, Notizen and Verlauf are not tabs of their own any more.
  await expect(tabs.getByRole("link", { name: /^Notizen/ })).toHaveCount(0);

  // Direct visits to the hidden tabs land on the Board.
  for (const tab of ["team", "geld"]) {
    await page.goto(`${href}/${tab}`);
    await expect(page).toHaveURL(new RegExp(`${href}/board$`));
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
  await expect(page.getByRole("dialog", { name: "Name, Dauer und Ort" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Name, Dauer und Ort" })).toBeHidden();
});

test("Task drawer: Erledigt and Wartet auf Amt are buttons, the other states sit in a menu", async ({
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
  const drawer = page.getByRole("complementary");
  await expect(drawer.getByRole("button", { name: "Erledigt" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Wartet auf Amt" })).toBeVisible();
  await expect(drawer.getByText(/Status:/)).toBeVisible();
  await drawer.getByRole("button", { name: "Weitere Status" }).click();
  const menu = page.getByRole("menu");
  for (const entry of ["In Arbeit", "Blockiert", "Übersprungen"])
    await expect(menu.getByRole("menuitem", { name: entry })).toBeVisible();
  await page.keyboard.press("Escape");
  // The carried-over count and the origin are not shown; the footer hint is gone.
  await expect(drawer.getByText("übertragen")).toHaveCount(0);
  await expect(drawer.getByText("Herkunft")).toHaveCount(0);
  await expect(drawer.getByText("lässt sich als Link weitergeben")).toHaveCount(0);
});

test("Kalender: module layers are in the layer panel and the presets switch them", async ({
  page,
}) => {
  await page.goto("/kalender");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
  const panel = page.getByRole("complementary", { name: "Ebenen" });
  for (const layer of ["Genehmigungen", "Aufgaben", "Fahrzeuge & Pflichten"])
    await expect(panel.getByRole("checkbox", { name: new RegExp(layer) })).toBeVisible();
  // Finance and shift layers are hidden for now.
  for (const layer of ["Raten & Zahlungen", "Schichten"])
    await expect(panel.getByRole("checkbox", { name: new RegExp(layer) })).toHaveCount(0);

  // The preset "Märkte + Genehmigungen" keeps the permit layer and drops the other module layers.
  await panel.getByRole("button", { name: "Märkte + Genehmigungen" }).click();
  await expect(page).toHaveURL(/frist=permits/);
  await expect(panel.getByRole("checkbox", { name: /Aufgaben/ })).not.toBeChecked();

  // The list view renders with the same selection.
  await page.goto("/kalender?ansicht=liste");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
});

test("+ Neu offers task, permit and defect to the owner (no payment or shift while hidden)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  const menu = page.getByRole("menu");
  for (const entry of ["Aufgabe", "Genehmigung", "Mangel melden"])
    await expect(menu.getByRole("menuitem", { name: entry })).toBeVisible();
  for (const entry of ["Zahlung", "Schicht"])
    await expect(menu.getByRole("menuitem", { name: entry })).toHaveCount(0);

  // "Aufgabe" opens the quick-create dialog on the board.
  await menu.getByRole("menuitem", { name: "Aufgabe" }).click();
  await expect(page).toHaveURL(/\/board/);
  await expect(page.getByRole("dialog")).toBeVisible();
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
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");

  // Optimistic: the card shows up in the next column at once; the undo toast offers to revert.
  await expect(to.locator(`[data-card="${id}"]`)).toBeVisible();
  await expect(from.locator(`[data-card="${id}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(from.locator(`[data-card="${id}"]`)).toBeVisible();
});

test("Board: three views, the category filter sits behind Filter, no Team/Finanzen chips", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle&ansicht=gruppiert");
  const views = page.getByRole("group", { name: "Ansicht" });
  // "Gruppiert" is gone; an old link falls back to Bereitschaft.
  await expect(views.getByRole("link")).toHaveText(["Bereitschaft", "Matrix", "Spalten"]);
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

test("Board: Kernaufgaben-Matrix shows markets x key tasks with a legend and opens the drawer", async ({
  page,
}) => {
  await page.goto("/board?ansicht=matrix&zeitraum=alle");
  const table = page.getByRole("table", { name: "Kernaufgaben der kommenden Veranstaltungen" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader").nth(1)).toBeVisible();
  await expect(page.getByRole("list", { name: "Legende" })).toBeVisible();
  const cell = table.locator("tbody a[href*='aufgabe=']").first();
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/aufgabe=/);
  await expect(page).toHaveURL(/ansicht=matrix/);
});

test("command palette finds tasks, permits and vehicles by their titles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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

test("Veranstaltung Überblick: shows Was fehlt and Kernaufgaben, no Zustand panel", async ({
  page,
}) => {
  await page.goto("/veranstaltungen?saison=2026");
  const href = await page.locator("tbody tr[data-row]").first().getAttribute("data-href");
  expect(href).toMatch(/^\/veranstaltungen\/[0-9a-f-]{36}$/);
  await page.goto(href as string);
  await expect(page.getByRole("heading", { level: 2, name: "Was fehlt" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Kernaufgaben" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Zustand" })).toHaveCount(0);
});
