import { expect, test as setup } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "owner@marktwerk.local";
const password = process.env.E2E_PASSWORD ?? "marktwerk-dev-123";

/** Keeps the optional local auto-login (src/server/dev-auto-login.ts) from signing in someone else. */
function noAutoLogin() {
  const url = setup.info().project.use.baseURL ?? "http://localhost:3000";
  return [{ name: "mw-dev-no-auto-login", value: "1", url }];
}

setup("login as owner", async ({ page }) => {
  await page.context().addCookies(noAutoLogin());
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/owner.json" });
});

setup("wrong password is rejected", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await context.addCookies(noAutoLogin());
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(`${password}-wrong`);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail oder Passwort ist falsch.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});
