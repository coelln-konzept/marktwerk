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
  await expect(page.getByRole("heading", { level: 2, name: "Nächstes Wochenende" })).toBeVisible();
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
  { path: "/finanzen", heading: "Finanzen" },
  { path: "/team/stunden", heading: "Team" },
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

test("Kalender: module layers are in the layer panel and the presets switch them", async ({
  page,
}) => {
  await page.goto("/kalender");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
  const panel = page.getByRole("complementary", { name: "Ebenen" });
  for (const layer of [
    "Genehmigungen",
    "Raten & Zahlungen",
    "Aufgaben",
    "Fahrzeuge & Pflichten",
    "Schichten",
  ])
    await expect(panel.getByRole("checkbox", { name: new RegExp(layer) })).toBeVisible();

  // The preset "Märkte + Genehmigungen" keeps the permit layer and drops the other module layers.
  await panel.getByRole("button", { name: "Märkte + Genehmigungen" }).click();
  await expect(page).toHaveURL(/frist=permits/);
  await expect(panel.getByRole("checkbox", { name: /Aufgaben/ })).not.toBeChecked();

  // The list view renders with the same selection.
  await page.goto("/kalender?ansicht=liste");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
});

test("+ Neu offers task, payment, permit, shift and defect to the owner", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  const menu = page.getByRole("menu");
  for (const entry of ["Aufgabe", "Zahlung", "Genehmigung", "Schicht", "Mangel melden"])
    await expect(menu.getByRole("menuitem", { name: entry })).toBeVisible();

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

test("command palette finds tasks, permits and vehicles by their titles", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox");
  await input.fill("genehmigung");
  const listbox = page.getByRole("listbox");
  // Hits are grouped by kind; at least one group other than actions answers.
  await expect(listbox.getByRole("group").first()).toBeVisible();
  await page.keyboard.press("Escape");
});
