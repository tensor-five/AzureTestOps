import { expect, test, type Locator, type Page } from "@playwright/test";
import { startColorCodingServer } from "./color-coding-server.js";

let server: Awaited<ReturnType<typeof startColorCodingServer>>;
test.beforeAll(async () => { server = await startColorCodingServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
  await server.reset();
  await page.goto(server.origin);
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(8);
});

const workItems = (page: Page) => page.getByRole("region", { name: "Work items", exact: true });
const colorRows = (page: Page) => workItems(page).locator(".color-rule-entry");
const workItemCard = (page: Page, id: number) => page.locator(`[data-item-key="wi:${id}"]`);

async function addRule(page: Page, field: "Title" | "State", value: string, label: string): Promise<Locator> {
  const index = await colorRows(page).count();
  await workItems(page).getByRole("button", { name: "Add color rule" }).click();
  const entry = colorRows(page).nth(index);
  const row = entry.getByRole("group", { name: /^Color rule \d+$/ });
  if (field === "State") await row.getByRole("combobox", { name: "Field" }).selectOption({ label: field });
  await row.getByRole("textbox", { name: "Value" }).fill(value);
  await entry.getByRole("textbox", { name: /^Rule label \d+$/ }).fill(label);
  return entry;
}

test("reordering updates effective counts, card color and right-aligned label, and survives reload", async ({ page }) => {
  await workItems(page).getByRole("button", { name: "Toggle Work items color rules" }).click();
  const toggle = workItems(page).getByRole("checkbox", { name: "Show labels on bugs" });
  await expect(toggle).toBeChecked();
  const first = await addRule(page, "Title", "Login", "Login-Probleme");
  const second = await addRule(page, "State", "Active", "Aktive Bugs");
  await second.getByRole("combobox", { name: "Color" }).selectOption("orange");

  await expect(first.locator(".color-rule-match-count")).toHaveText("7 colored / 7 matches");
  await expect(second.locator(".color-rule-match-count")).toHaveText("0 colored / 4 matches");
  await expect(second.locator(".color-rule-overlap")).toHaveText("4 already colored by earlier rules");
  const card = workItemCard(page, 501);
  await expect(card).toHaveAttribute("data-color-rule-color", "blue");
  await expect(card.locator(".relations-view-card-rule-label")).toHaveText("Login-Probleme");

  await colorRows(page).nth(1).getByRole("button", { name: "Move color rule 2 up" }).focus();
  await page.keyboard.press("Enter");
  await expect(workItems(page).locator(".color-rule-panel").getByRole("status")).toHaveText("Color rule moved to position 1.");
  await expect(colorRows(page).nth(0).locator(".color-rule-match-count")).toHaveText("4 colored / 4 matches");
  await expect(colorRows(page).nth(1).locator(".color-rule-match-count")).toHaveText("3 colored / 7 matches");
  await expect(card).toHaveAttribute("data-color-rule-color", "orange");
  await expect(card.locator(".relations-view-card-rule-label")).toHaveText("Aktive Bugs");
  const rightGap = await card.evaluate(element => element.getBoundingClientRect().right
    - element.querySelector(".relations-view-card-rule-label")!.getBoundingClientRect().right);
  expect(rightGap).toBeLessThanOrEqual(20);

  await toggle.uncheck();
  await expect(page.locator(".relations-view-card-rule-label")).toHaveCount(0);
  await expect(card).toHaveAttribute("data-color-rule-color", "orange");
  await expect.poll(() => server.disk()).toMatch(/"showBugLabels":\s*false/);
  server.reopenDatabase();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(card).toHaveAttribute("data-color-rule-color", "orange");
  await expect(page.locator(".relations-view-card-rule-label")).toHaveCount(0);
  await workItems(page).getByRole("button", { name: "Toggle Work items color rules" }).click();
  await expect(workItems(page).getByRole("checkbox", { name: "Show labels on bugs" })).not.toBeChecked();
  await expect(colorRows(page).nth(0).getByRole("textbox", { name: "Rule label 1" })).toHaveValue("Aktive Bugs");

  await page.getByLabel("Harness Set").selectOption("set-b");
  await workItems(page).getByRole("button", { name: "Toggle Work items color rules" }).click();
  await expect(workItems(page).getByRole("checkbox", { name: "Show labels on bugs" })).toBeChecked();
  await expect(colorRows(page)).toHaveCount(0);
});

test("all labels can be shown again while rule colors stay applied", async ({ page }) => {
  await workItems(page).getByRole("button", { name: "Toggle Work items color rules" }).click();
  await addRule(page, "Title", "Login", "Login-Probleme");
  const toggle = workItems(page).getByRole("checkbox", { name: "Show labels on bugs" });
  await toggle.uncheck();
  await expect(page.locator(".relations-view-card-rule-label")).toHaveCount(0);
  await toggle.check();
  await expect(workItemCard(page, 501).locator(".relations-view-card-rule-label")).toHaveText("Login-Probleme");
  await expect(workItemCard(page, 503).locator(".relations-view-card-rule-label")).toHaveText("Login-Probleme");
  await expect(workItemCard(page, 502).locator(".relations-view-card-rule-label")).toHaveCount(0);
  await expect(workItemCard(page, 504).locator(".relations-view-card-rule-label")).toHaveCount(0);
});

test("the rule controls and the right-edge label fit a narrow work item column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Work Items/ }).click();
  await workItems(page).getByRole("button", { name: "Toggle Work items color rules" }).click();
  const entry = await addRule(page, "Title", "Login", "Login-Probleme");
  for (const control of await entry.locator("input,select,button,[data-color-rule-preview]").all()) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  }
  const card = workItemCard(page, 501);
  const label = card.locator(".relations-view-card-rule-label");
  await expect(label).toBeVisible();
  const bounds = (await label.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  const rightGap = await card.evaluate(element => element.getBoundingClientRect().right
    - element.querySelector(".relations-view-card-rule-label")!.getBoundingClientRect().right);
  expect(rightGap).toBeLessThanOrEqual(20);
});

test("a long title shortens while the complete label stays on the same row", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("button", { name: /^Work Items/ }).click();
  await workItems(page).getByRole("button", { name: "Toggle Work items color rules" }).click();
  const longLabel = "KundenrelevanterSynchronisierungsfehlerBeiDerAnmeldung";
  await addRule(page, "Title", "Login", longLabel);
  const card = workItemCard(page, 501);
  await card.locator(".relations-view-card-title").evaluate(element => {
    element.textContent = "Anmeldung schlägt nach einer sehr langen Synchronisierung wiederholt fehl";
  });

  const label = card.locator(".relations-view-card-rule-label");
  await expect(label).toHaveText(longLabel);
  const metrics = await card.evaluate(element => {
    const cardRect = element.getBoundingClientRect();
    const labelElement = element.querySelector<HTMLElement>(".relations-view-card-rule-label")!;
    const labelRect = labelElement.getBoundingClientRect();
    const titleElement = element.querySelector<HTMLElement>(".relations-view-card-title")!;
    const titleRect = titleElement.getBoundingClientRect();
    return {
      labelInside: labelRect.left >= cardRect.left && labelRect.right <= cardRect.right + 1,
      labelUnclipped: labelElement.scrollWidth <= labelElement.clientWidth + 1
        && labelElement.scrollHeight <= labelElement.clientHeight + 1,
      labelWrapped: labelRect.height > 25,
      titleTruncated: titleElement.scrollWidth > titleElement.clientWidth,
      sameRow: Math.abs((titleRect.top + titleRect.bottom) / 2 - (labelRect.top + labelRect.bottom) / 2) < 1,
      rightGap: cardRect.right - labelRect.right
    };
  });
  expect(metrics).toEqual({ labelInside: true, labelUnclipped: true, labelWrapped: true,
    titleTruncated: true, sameRow: true, rightGap: expect.any(Number) });
  expect(metrics.rightGap).toBeLessThanOrEqual(20);
});
