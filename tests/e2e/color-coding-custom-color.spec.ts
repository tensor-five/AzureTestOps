import { expect, test } from "@playwright/test";
import { startColorCodingServer } from "./color-coding-server.js";

let server: Awaited<ReturnType<typeof startColorCodingServer>>;
test.beforeAll(async () => { server = await startColorCodingServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
  await server.reset();
  await page.goto(server.origin);
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(8);
});

test("custom color updates preview and matching card, then survives a fresh preference read", async ({ page }) => {
  const column = page.getByRole("region", { name: "Work items", exact: true });
  await column.getByRole("button", { name: "Toggle Work items color rules" }).click();
  await column.getByRole("button", { name: "Add color rule" }).click();
  const row = column.getByRole("group", { name: "Color rule 1" });
  await row.getByRole("textbox", { name: "Value" }).fill("Login");
  await row.getByRole("button", { name: "Choose custom color" }).click();
  await row.getByLabel("Custom color").fill("#3a7fc2");

  const card = page.locator('[data-item-key="wi:501"]');
  await expect(card).toHaveAttribute("data-color-rule-color", "#3a7fc2");
  await expect(card).toHaveAttribute("title", /Custom #3A7FC2/);
  await expect(row.getByRole("img", { name: "Color preview: Custom #3A7FC2" })).toBeVisible();
  await expect.poll(() => server.disk()).toContain('"#3a7fc2"');

  server.reopenDatabase();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(card).toHaveAttribute("data-color-rule-color", "#3a7fc2");
  await expect(card).toHaveCSS("border-left-color", "rgb(58, 127, 194)");
});

test("custom color is available for test cases in a narrow column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const column = page.getByRole("region", { name: "Test cases", exact: true });
  await column.getByRole("button", { name: "Toggle Test cases color rules" }).click();
  await column.getByRole("button", { name: "Add color rule" }).click();
  const row = column.getByRole("group", { name: "Color rule 1" });
  await row.getByRole("textbox", { name: "Value" }).fill("Login");
  await row.getByRole("button", { name: "Choose custom color" }).click();
  await row.getByLabel("Custom color").fill("#b34c79");

  const card = page.locator('[data-item-key="tc:101:1"]');
  await expect(card).toHaveAttribute("data-color-rule-color", "#b34c79");
  await expect(card).toHaveCSS("border-left-color", "rgb(179, 76, 121)");
  for (const control of await row.locator("input,select,button,[data-color-rule-preview]").all()) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  }
});
