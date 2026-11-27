import { expect, type Page, test } from "@playwright/test";

/** The "Rückgängig" button of a toast (the top bar has its own "Rückgängig: …" button). */
const toastUndo = (page: Page) =>
  page.getByRole("region", { name: "Hinweise" }).getByRole("button", { name: "Rückgängig" });

/**
 * The first empty cell (no shift, not "nicht verfügbar") under a day header that shows "offen", as the
 * grid's `data-row`/`data-col`. The week-total columns sit between the day columns, so the header index is
 * mapped to the cell index of the body rows (header 0 = "Person", body row header = th, cells = td).
 */
async function findOpenEmptyCell(page: Page) {
  return page.evaluate(() => {
    const table = document.querySelector("table");
    const headers = [...(table?.querySelectorAll("thead th") ?? [])];
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])];
    for (let i = 1; i < headers.length; i++) {
      if (!/\d+ offen/.test(headers[i]?.textContent ?? "")) continue;
      for (const [r, tr] of rows.entries()) {
        const button = tr.querySelectorAll("td")[i - 1]?.querySelector("button[data-row]");
        // An empty cell holds only the sr-only "Name, Mo 5. Apr." label (one child, no chips or note).
        if (button && button.children.length === 1) {
          return {
            row: Number(button.getAttribute("data-row")),
            col: Number(button.getAttribute("data-col")),
            r,
          };
        }
      }
    }
    return null;
  });
}

test("plan a person on a market day: the day's gap shrinks, undo takes it back", async ({
  page,
}) => {
  // April 2027: 24 needs, mostly open (seeded planning window 2026-11-25 … 2027-04-30).
  await page.goto("/team/planung?month=2027-04");
  await expect(page.getByRole("heading", { level: 1, name: "Planung" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  const spot = await findOpenEmptyCell(page);
  expect(spot, "a day with open needs and a person with an empty cell").not.toBeNull();
  const cell = page.locator(`button[data-row='${spot?.row}'][data-col='${spot?.col}']`);
  const name = (await cell.innerText()).split(",")[0] ?? "";
  // The column's header, to watch its gap: every header has the same index shift as findOpenEmptyCell.
  const header = page
    .locator("thead th")
    .nth(
      await cell.evaluate((el) =>
        [...(el.closest("tr")?.children ?? [])].indexOf(el.closest("td") as Element),
      ),
    );
  const openBefore = (await header.getByText(/\d+ offen/).innerText()).trim();

  await cell.click();
  // One open need: "Einplanen…"; several: "Markt · Rolle · von–bis". Both are menu items before the
  // "Nicht verfügbar" one; the first item is an assignment because the day has an open need.
  await page
    .getByRole("menuitem", { name: /^Einplanen…$|·.*–/ })
    .first()
    .click();

  // A warning (unavailable, over budget, overlap, ArbZG) asks once.
  const confirm = page.getByRole("button", { name: "Trotzdem einplanen" });
  await confirm
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => confirm.click())
    .catch(() => undefined);

  await expect(
    page.getByText(new RegExp(`${name} am .+ eingeplant \\(angefragt\\)`)),
  ).toBeVisible();
  // The cell now holds the shift and the day's gap shrank (or the day is now "Besetzt").
  await expect(cell.locator("> *")).not.toHaveCount(1);
  await expect(header).not.toContainText(openBefore);

  // Leave the data as it was: undo.
  await toastUndo(page).click();
  await expect(header).toContainText(openBefore);
});
