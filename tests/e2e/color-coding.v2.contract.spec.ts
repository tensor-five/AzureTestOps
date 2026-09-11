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
const testCases = (page: Page) => page.getByRole("region", { name: "Test cases", exact: true });
const workItemCard = (page: Page, id: number) => page.locator(`[data-item-key="wi:${id}"]`);
const testCaseCard = (page: Page, id: number) => page.locator(`[data-item-key="tc:${id}:1"]`);
const workItemToggle = (page: Page) => workItems(page).getByRole("button", { name: "Toggle Work items color rules", exact: true });
const ruleRows = (page: Page) => workItems(page).getByRole("group", { name: /^Color rule \d+$/ });

async function addWorkItemRule(page: Page, value: string): Promise<Locator> {
  const toggle = workItemToggle(page);
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await workItems(page).getByRole("button", { name: "Add color rule", exact: true }).click();
  const row = ruleRows(page).last();
  await row.getByRole("textbox", { name: "Value", exact: true }).fill(value);
  return row;
}

test("CC2-01 through CC2-05 apply the independent Work Item list to every queried type", async ({ page }) => {
  await expect(workItemToggle(page)).toHaveAttribute("aria-expanded", "false");
  const row = await addWorkItemRule(page, "Login");
  for (const id of [501, 503, 504, 505, 506, 507, 508]) {
    await expect(workItemCard(page, id)).toHaveAttribute("data-color-rule-color", "blue");
  }
  await expect(workItemCard(page, 502)).not.toHaveAttribute("data-color-rule-color");
  await expect(testCaseCard(page, 101)).not.toHaveAttribute("data-color-rule-color");
  await expect(ruleRows(page)).toHaveCount(1);
  await expect(row.getByRole("combobox")).toHaveCount(3);
  await expect(row.getByRole("textbox")).toHaveCount(1);
  await expect(row.getByLabel("Type", { exact: true })).toHaveCount(0);
  await expect(workItems(page).getByRole("button", { name: /^(group|condition|AND|OR)$/i })).toHaveCount(0);
});

test("CC2-03 restores a legacy Bug rule and applies it to non-Bug Work Items", async ({ page }) => {
  await server.seed({
    setColorRules: {
      "set-a": {
        bugs: [{ id: "legacy", field: "title", comparison: "contains", value: "Login", color: "green" }]
      }
    }
  });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(workItemToggle(page)).toHaveAttribute("aria-expanded", "false");
  for (const id of [501, 504, 505, 506, 507, 508]) {
    await expect(workItemCard(page, id)).toHaveAttribute("data-color-rule-color", "green");
  }
});

test("CC2-06 and CC2-07 preview all eight theme-aware card colors", async ({ page }) => {
  const row = await addWorkItemRule(page, "Login");
  const picker = row.getByRole("combobox", { name: "Color", exact: true });
  expect((await picker.locator("option").allTextContents()).sort()).toEqual(
    ["Blue", "Orange", "Green", "Violet", "Red", "Teal", "Yellow", "Gray"].sort()
  );
  const preview = row.getByRole("img", { name: "Color preview: Blue", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).not.toHaveAttribute("tabindex");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const rails = new Set<string>();
    for (const [label, value] of [["Blue", "blue"], ["Orange", "orange"], ["Green", "green"], ["Violet", "violet"], ["Red", "red"], ["Teal", "teal"], ["Yellow", "yellow"], ["Gray", "gray"]]) {
      await picker.selectOption({ label });
      const immediatePreview = await row.evaluate((ruleRow, selectedLabel) => {
        const previewElement = ruleRow.querySelector<HTMLElement>("[data-color-rule-preview]");
        if (!previewElement) return null;
        const style = getComputedStyle(previewElement);
        return {
          label: previewElement.getAttribute("aria-label"),
          rail: style.borderLeftColor,
          fill: style.backgroundColor
        };
      }, label);
      expect(immediatePreview).not.toBeNull();
      expect(immediatePreview?.label).toBe(`Color preview: ${label}`);
      await expect(workItemCard(page, 501)).toHaveAttribute("data-color-rule-color", value);
      const paint = await workItemCard(page, 501).evaluate(async (card) => {
        await Promise.all(card.getAnimations().map(animation => animation.finished));
        const cardStyle = getComputedStyle(card);
        const titleStyle = getComputedStyle(card.querySelector(".relations-view-card-title")!);
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => { const normalized = channel / 255; return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const background = luminance(cardStyle.backgroundColor), foreground = luminance(titleStyle.color);
        return {
          cardRail: cardStyle.borderLeftColor,
          cardFill: cardStyle.backgroundColor,
          contrast: (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05)
        };
      });
      expect(immediatePreview?.rail).toBe(paint.cardRail);
      expect(immediatePreview?.fill).toBe(paint.cardFill);
      expect(paint.contrast).toBeGreaterThanOrEqual(4.5);
      rails.add(paint.cardRail);
    }
    expect(rails.size).toBe(8);
  }
});

test("CC2-08 through CC2-10 retain card behavior and persist a new color per set", async ({ page }) => {
  const row = await addWorkItemRule(page, "Feature");
  await row.getByRole("combobox", { name: "Color", exact: true }).selectOption({ label: "Teal" });
  await expect(workItemCard(page, 506)).toHaveAttribute("data-color-rule-color", "teal");
  await expect(workItemCard(page, 506).getByLabel("Type: Feature")).toBeVisible();
  await expect(workItemCard(page, 506).getByLabel("State: New")).toBeVisible();
  const rows = page.locator(".relations-view-work-item-list > [data-work-item-id]");
  const beforeDrag = await rows.evaluateAll(items => items.map(item => item.getAttribute("data-work-item-id")));
  await page.locator('[data-work-item-id="506"] .relations-view-drag-handle').dragTo(
    page.locator('[data-work-item-id="501"]')
  );
  const afterDrag = await rows.evaluateAll(items => items.map(item => item.getAttribute("data-work-item-id")));
  expect(afterDrag).not.toEqual(beforeDrag);
  expect(afterDrag.indexOf("506")).toBeLessThan(beforeDrag.indexOf("506"));
  await expect(workItemCard(page, 506)).toHaveAttribute("data-color-rule-color", "teal");
  await expect.poll(() => server.disk()).toContain('"teal"');
  await workItemToggle(page).click();
  await expect(workItemToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(workItemCard(page, 506)).toHaveAttribute("data-color-rule-color", "teal");
  server.reopenDatabase();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(workItemToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(workItemCard(page, 506)).toHaveAttribute("data-color-rule-color", "teal");
  await page.getByLabel("Harness Set").selectOption("set-b");
  await expect(workItemCard(page, 506)).not.toHaveAttribute("data-color-rule-color");
});

test("CC2-09 and CC2-11 keep both color areas independent and fit the preview in a narrow column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const testCaseToggle = testCases(page).getByRole("button", { name: "Toggle Test cases color rules", exact: true });
  await expect(testCaseToggle).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /^Work Items/ }).click();
  await expect(workItemToggle(page)).toHaveAttribute("aria-expanded", "false");
  const row = await addWorkItemRule(page, "Login");
  await expect(page.locator('.relations-view-column-test-cases button[aria-label="Toggle Test cases color rules"]')).toHaveAttribute("aria-expanded", "false");
  const preview = row.getByRole("img", { name: "Color preview: Blue", exact: true });
  for (const control of await row.locator("input,select,button,[data-color-rule-preview]").all()) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  }
  await row.getByRole("combobox", { name: "Color", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(preview).not.toBeFocused();
  await expect(row.getByRole("button", { name: "Delete color rule", exact: true })).toBeFocused();
});
