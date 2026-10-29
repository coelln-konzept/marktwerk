import { expect, type Page, test } from "@playwright/test";

test("Übersicht loads after login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();
});

test('Übersicht: the weekend next to Heute & überfällig, Diese Woche below; "+ N weitere" opens in place; no KPI or season strip', async ({
  page,
}) => {
  await page.goto("/");
  const weekend = page.getByRole("heading", { level: 2, name: "Dieses Wochenende" });
  const due = page.getByRole("heading", { level: 2, name: "Heute & überfällig" });
  await expect(weekend).toBeVisible();
  await expect(due).toBeVisible();
  const [weekendBox, dueBox] = await Promise.all([weekend.boundingBox(), due.boundingBox()]);
  // Two cards side by side on desktop: the weekend is the left one, the headings sit on one line (the
  // due header carries count badges, so its heading can be a few px higher than the weekend's).
  expect(weekendBox?.x ?? 0).toBeLessThan(dueBox?.x ?? 0);
  expect(Math.abs((weekendBox?.y ?? 0) - (dueBox?.y ?? 0))).toBeLessThan(24);

  // "Diese Woche" (the next 7 days, per market) runs across both columns below them.
  const week = page.getByRole("heading", { level: 2, name: "Diese Woche" });
  await expect(week).toBeVisible();
  const weekBox = await week.boundingBox();
  expect(weekBox?.y ?? 0).toBeGreaterThan(Math.max(weekendBox?.y ?? 0, dueBox?.y ?? 0));
  expect(weekBox?.x ?? 0).toBeLessThan((dueBox?.x ?? 0) - 100);

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
  await page.getByRole("button", { name: "Rückgängig" }).click();
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
  await expect(tabs.getByRole("link", { name: "Board" })).toBeVisible();
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
  await expect(page.getByRole("dialog", { name: "Name, Dauer und Ort" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Name, Dauer und Ort" })).toBeHidden();
});

test("Task drawer: Erledigt and Wartet are buttons, the other states sit in a menu", async ({
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
  // The title is "<market> · <status>"; the chip shows the whole market name.
  const name = ((await chip.getAttribute("title")) as string).split(" · ")[0] as string;
  expect((await chip.innerText()).replace(/\s+/g, " ").trim()).toContain(name);

  // The list view renders with the same selection.
  await page.goto("/kalender?ansicht=liste");
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();

  // The preset click above was saved for the person: leave the defaults behind for the next run.
  await resetKalenderLayers(page);
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

test("Benachrichtigungen: the bell is the way in, filters, Erledigt and Zurückstellen with undo, J/K", async ({
  page,
}) => {
  // Needs the seeded database after one deadline sweep (docs/development/testing.md).
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // No sidebar entry: the bell in the top bar is the entry.
  await expect(
    page.getByRole("navigation").getByRole("link", { name: /^Benachrichtigungen/ }),
  ).toHaveCount(0);

  // Bell: count, the most urgent items with a quick Erledigt, "Alle anzeigen".
  await page.getByRole("button", { name: /^Benachrichtigungen/ }).click();
  const popover = page.getByRole("dialog", { name: "Benachrichtigungen" });
  await expect(
    popover.getByRole("button", { name: "Erledigt", exact: true }).first(),
  ).toBeVisible();
  await popover.getByRole("link", { name: /^Alle \d+ anzeigen$/ }).click();
  await expect(page).toHaveURL(/\/benachrichtigungen$/);
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

  // Erledigt completes the task (own undo toast); the notification resolves with it.
  await rows.first().getByRole("button", { name: "Erledigt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rückgängig" })).toBeVisible();
  await expect.poll(open).toBe(before - 1);
  await page.getByRole("button", { name: "Rückgängig" }).click();
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
  await page.getByRole("button", { name: "Rückgängig" }).click();
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
  await page.goto("/board?ansicht=matrix&zeitraum=alle");
  const back = page.getByRole("button", { name: "Zurück", exact: true });
  await expect(back).toHaveCount(0);
  await page
    .getByRole("table", { name: "Kernaufgaben der kommenden Veranstaltungen" })
    .locator("tbody th a")
    .first()
    .click();
  await expect(page).toHaveURL(/\/veranstaltungen\/[0-9a-f-]{36}$/);
  const event = page.url();
  await back.click();
  await expect(page).toHaveURL(/\/board\?ansicht=matrix&zeitraum=alle$/);

  // Opened directly (new tab): back goes to the parent crumb.
  const direct = await page.context().newPage();
  await direct.goto(event);
  await direct.getByRole("button", { name: "Zurück", exact: true }).click();
  await expect(direct).toHaveURL(/\/veranstaltungen$/);
});

test("Kernaufgaben: the circle marks a task done with undo", async ({ page }) => {
  await page.goto("/veranstaltungen?saison=2026");
  const href = await page.locator("tbody tr[data-row]").first().getAttribute("data-href");
  await page.goto(href as string);
  const panel = page.getByRole("region", { name: "Kernaufgaben" });
  const open = panel.locator('button[aria-pressed="false"]').first();
  const label = (await open.getAttribute("aria-label")) ?? "";
  const title = label.replace(/^„/, "").replace(/“ als erledigt markieren$/, "");
  await open.click();
  await expect(page.getByText(`„${title}“ erledigt`)).toBeVisible();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(
    panel.locator(`button[aria-pressed="false"][aria-label="${label}"]`).first(),
  ).toBeVisible();
});

test("Event board: Ablauf lists every task by phase, one line each; a row opens the drawer", async ({
  page,
}) => {
  await page.goto("/board?zeitraum=alle");
  const href = await page.locator("tbody tr[data-href]").first().getAttribute("data-href");
  await page.goto(`${href}/board`);
  await page.getByRole("group", { name: "Ansicht" }).getByRole("link", { name: "Ablauf" }).click();
  await expect(page).toHaveURL(/ansicht=ablauf/);
  const rows = page.locator("li[data-row]");
  await expect(rows.first()).toBeVisible();
  // Phase headers carry a task count; finished tasks wait collapsed at the end.
  await expect(
    page
      .locator("main h2")
      .filter({ hasText: /Aufgaben?$/ })
      .first(),
  ).toBeVisible();
  const done = page
    .locator("main details")
    .filter({ has: page.locator("summary", { hasText: /^Erledigt/ }) });
  if ((await done.count()) > 0) await expect(done).not.toHaveAttribute("open", /.*/);
  // Single-line rows on desktop: much shorter than the 130 px cards.
  const box = await rows.first().boundingBox();
  expect(box?.height ?? 0).toBeLessThan(56);
  await rows.first().locator("span").nth(2).click();
  await expect(page).toHaveURL(/aufgabe=/);
  await expect(page).toHaveURL(/ansicht=ablauf/);
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
