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
  { path: "/genehmigungen", heading: "Genehmigungen" },
  { path: "/firma", heading: "Pflichten & Fahrzeuge" },
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

test("Event page: no Team and Geld tabs, links from the Übersicht open the Board tab", async ({
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

  // Direct visits to the hidden tabs land on the Board.
  for (const tab of ["team", "geld"]) {
    await page.goto(`${href}/${tab}`);
    await expect(page).toHaveURL(new RegExp(`${href}/board$`));
  }
});

test("Kalender: Ebenen collapsed by default, two presets, tasks off, full market names", async ({
  page,
}) => {
  await page.goto("/kalender");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
  // No breadcrumb above a top-level page: it would only repeat the H1.
  await expect(page.getByRole("navigation", { name: "Brotkrumen" })).toHaveCount(0);

  const toggle = page.getByRole("button", { name: "Ebenen" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("complementary", { name: "Ebenen" });
  await expect(panel).toBeVisible();

  // Permits and obligations on, tasks off; no disabled "Rückgaben" and no "Nur meine Zuständigkeit".
  await expect(panel.getByRole("checkbox", { name: /Genehmigungen/ })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: /Aufgaben/ })).not.toBeChecked();
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
  const name = (await chip.getAttribute("title")) as string;
  expect((await chip.innerText()).replace(/\s+/g, " ").trim()).toBe(name);

  // The list view renders with the same selection.
  await page.goto("/kalender?ansicht=liste");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
});

test("Sidebar: five daily entries, Stammdaten collapsed and remembered, Einstellungen in the profile menu", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).first();
  for (const entry of ["Übersicht", "Board", "Veranstaltungen", "Kalender", "Genehmigungen"])
    await expect(nav.getByRole("link", { name: new RegExp(`^${entry}`) })).toBeVisible();
  // Gone: Logbuch, the "Später" group, Benachrichtigungen, Einstellungen, Firma.
  for (const entry of [
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
  for (const entry of ["Orte", "Kontakte", "Aussteller", "Wissen", "Pflichten"])
    await expect(nav.getByRole("link", { name: entry, exact: true })).toBeVisible();

  // Remembered across a reload.
  await page.reload();
  await expect(nav.getByRole("button", { name: "Stammdaten" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await nav.getByRole("link", { name: "Pflichten", exact: true }).click();
  await expect(page).toHaveURL(/\/firma\/pflichten$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Pflichten & Fahrzeuge" }),
  ).toBeVisible();

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
  const focus = filters.getByRole("link", { name: /Fehlt\/abgelaufen für kommende Märkte/ });
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

test("Notifications are hidden: no bell, no sidebar entry, the page answers 404", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Benachrichtigungen/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Benachrichtigungen/ })).toHaveCount(0);
  const response = await page.goto("/benachrichtigungen");
  expect(response?.status()).toBe(404);
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

  const from = page.getByRole("region", { name: "Vorbereitung" });
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

test("Board: Bereitschaft is the default view, one row per market linking to its Board", async ({
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
  await expect(market).toHaveAttribute("href", /\/veranstaltungen\/[^/]+\/board$/);
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
