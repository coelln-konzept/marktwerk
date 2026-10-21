import { expect, test } from "@playwright/test";

test("Übersicht loads after login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).first()).toBeVisible();
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
