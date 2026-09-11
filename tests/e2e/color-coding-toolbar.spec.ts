import { expect, test, type Locator } from "@playwright/test";
import { startColorCodingServer } from "./color-coding-server.js";

let server: Awaited<ReturnType<typeof startColorCodingServer>>;
test.beforeAll(async () => { server = await startColorCodingServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await server.reset(); await page.goto(server.origin); });

async function expectEqualButtons(filter: Locator, palette: Locator) {
  const filterBox = (await filter.boundingBox())!, paletteBox = (await palette.boundingBox())!;
  expect(Math.abs(filterBox.width - paletteBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(filterBox.height - paletteBox.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(filterBox.y - paletteBox.y)).toBeLessThanOrEqual(1);
  expect(paletteBox.x).toBeGreaterThan(filterBox.x);
  await expect(palette).toHaveText("");
}

test("CC-08 palette stays the same size as filters with active counts", async ({ page }) => {
  for (const [label, states] of [["Test cases", ["Ready", "Design"]], ["Work items", ["Active", "Closed"]]] as const) {
    const column = page.getByRole("region", { name: label, exact: true });
    const filter = column.getByRole("button", { name: `Toggle ${label} filters`, exact: true });
    const palette = column.getByRole("button", { name: /color rules/i });
    await expectEqualButtons(filter, palette);
    await filter.click();
    await column.locator("summary").filter({ hasText: /^State$/ }).click();
    for (const [index, state] of states.entries()) {
      await column.getByRole("checkbox", { name: new RegExp(`^${state}\\b`) }).check();
      await expect(filter.locator(".filter-bar-toggle-count")).toHaveText(String(index + 1));
      await expectEqualButtons(filter, palette);
    }
    await filter.click();
    await expect(filter.locator(".filter-bar-toggle-count")).toHaveText("2");
    await expectEqualButtons(filter, palette);
    await filter.click();
    await column.getByRole("button", { name: "Clear all filters", exact: true }).click();
    await expect(filter.locator(".filter-bar-toggle-count")).toHaveCount(0);
    await expectEqualButtons(filter, palette);
  }
});

test("CC-02/14 desktop rules use one row and comparison text fits at desktop and mobile widths", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const column = page.getByRole("region", { name: "Test cases", exact: true });
  await column.getByRole("button", { name: /color rules/i }).click();
  await column.getByRole("button", { name: "Add color rule", exact: true }).click();
  const row = column.getByRole("group", { name: "Color rule 1", exact: true });
  const comparison = row.getByRole("combobox", { name: "Comparison", exact: true });
  await comparison.selectOption({ label: "Does not contain" });
  const centers = await row.locator("input,select,button").evaluateAll(controls => controls.map(control => {
    const bounds = control.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  }));
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await comparison.evaluate(element => {
      const select = element as HTMLSelectElement, style = getComputedStyle(select);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = style.font;
      return { width: select.getBoundingClientRect().width, text: context.measureText(select.selectedOptions[0].text).width,
        padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) };
    });
    // Leave room for the native select arrow in addition to the complete label.
    expect(metrics.width).toBeGreaterThanOrEqual(metrics.text + metrics.padding + 20);
    for (const control of await row.locator("input,select,button").all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    }
  }
});
