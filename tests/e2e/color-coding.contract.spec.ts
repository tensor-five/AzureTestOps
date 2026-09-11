import { expect, test, type Locator, type Page } from "@playwright/test";
import { startColorCodingServer } from "./color-coding-server.js";

let server: Awaited<ReturnType<typeof startColorCodingServer>>;
test.beforeAll(async () => { server = await startColorCodingServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await server.reset(); await page.goto(server.origin);
  await expect(page.locator(".relations-view-card-test-case")).toHaveCount(4);
  expect(errors).toEqual([]);
});
const column = (page: Page, bug = false) => page.getByRole("region", { name: bug ? "Work items" : "Test cases", exact: true });
const toggle = (page: Page, bug = false) => column(page, bug).getByRole("button", { name: /color rules/i });
const card = (page: Page, id: number) => page.locator(`[data-item-key="${id >= 500 ? 'wi:' + id : 'tc:' + id + ':1'}"]`);
const rows = (page: Page, bug = false) => column(page, bug).getByRole("group", { name: /^Color rule \d+$/ });
async function open(page: Page, bug = false) { await expect(toggle(page, bug)).toBeVisible(); if (await toggle(page, bug).getAttribute("aria-expanded") !== "true") await toggle(page, bug).click(); }
async function add(page: Page, value: string, options: { bug?: boolean; field?: string; comparison?: string; color?: string } = {}) {
  await open(page, options.bug);
  await column(page, options.bug).getByRole("button", { name: "Add color rule", exact: true }).click();
  const row = rows(page, options.bug).nth(await rows(page, options.bug).count() - 1);
  if (options.field) await row.getByRole("combobox", { name: "Field", exact: true }).selectOption({ label: options.field });
  if (options.comparison) await row.getByRole("combobox", { name: "Comparison", exact: true }).selectOption({ label: options.comparison });
  await row.getByRole("textbox", { name: "Value", exact: true }).fill(value);
  if (options.color) await row.getByRole("combobox", { name: "Color", exact: true }).selectOption({ label: options.color });
  return row;
}
async function colored(target: Locator, color: string | null) {
  if (color) await expect(target).toHaveAttribute("data-color-rule-color", color);
  else await expect(target).not.toHaveAttribute("data-color-rule-color");
}

test("CC-08/09/10/14 icon-only controls align with filters and collapse independently", async ({ page }) => {
  for (const bug of [false, true]) {
    const button = toggle(page, bug);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toHaveText("");
    await expect(button.locator("svg")).toHaveCount(1);
    await expect(button).toHaveAttribute("title", /color rules/i);
    const filter = column(page, bug).getByRole("button", { name: /^Toggle .* filters$/ });
    const a = (await button.boundingBox())!, b = (await filter.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(a.x).toBeGreaterThan(b.x);
    expect(await button.evaluate(e => e.previousElementSibling?.getAttribute("aria-label"))).toMatch(/^Toggle .* filters$/);
    await expect(column(page, bug).getByRole("button", { name: "Add color rule" })).toHaveCount(0);
  }
  await toggle(page).focus(); await page.keyboard.press("Enter");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(toggle(page, true)).toHaveAttribute("aria-expanded", "false");
  const filter = column(page).getByRole("button", { name: "Toggle Test cases filters" });
  await filter.click(); await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await filter.click(); await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  const row = await add(page, "Login");
  await toggle(page).click();
  await expect(row).toHaveCount(0);
  await colored(card(page, 101), "blue");
  await toggle(page).focus(); await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[aria-label="Color rules"]') !== null)).toBe(false);
  await open(page); await expect(rows(page).first().getByRole("textbox")).toHaveValue("Login");
  await add(page, "Export", { bug: true, color: "Orange" });
  await toggle(page, true).click(); await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await colored(card(page, 502), "orange"); await expect(rows(page, true)).toHaveCount(0);
  await open(page, true); await expect(rows(page, true).first().getByRole("textbox")).toHaveValue("Export");
});

test("CC-01/02/03/05/06 separate simple lists append, edit and delete rules", async ({ page }) => {
  await open(page); await open(page, true);
  await expect(rows(page)).toHaveCount(0); await expect(rows(page, true)).toHaveCount(0);
  const first = await add(page, "Login");
  await expect(first.getByRole("combobox")).toHaveCount(3);
  await expect(first.getByRole("textbox")).toHaveCount(1);
  await expect(column(page).getByRole("button", { name: /group|condition|AND|OR/i }).filter({ hasText: /group|condition|^AND$|^OR$/i })).toHaveCount(0);
  await expect(column(page).getByRole("combobox")).toHaveCount(3);
  await expect(first.getByRole("combobox", { name: "Field", exact: true }).locator("option")).toHaveText(["Title", "State", "Tag"]);
  await add(page, "prüfen", { color: "Orange" });
  await colored(card(page, 101), "blue"); await colored(card(page, 102), "orange");
  await colored(card(page, 501), null);
  await add(page, "Login", { bug: true, color: "Green" });
  await colored(card(page, 501), "green"); await colored(card(page, 504), "green");
  await colored(card(page, 101), "blue");
  await first.getByRole("button", { name: "Delete color rule" }).click();
  await colored(card(page, 101), "orange");
  await rows(page).first().getByRole("textbox").fill("absent");
  await colored(card(page, 101), null);
  await rows(page).first().getByRole("button", { name: "Delete color rule" }).click();
  await expect(rows(page)).toHaveCount(0); await colored(card(page, 501), "green");
});

for (const bug of [false, true]) {
  test(`CC-04/05 all title comparisons and literal matching (${bug ? 'Bugs' : 'Test Cases'})`, async ({ page }) => {
    const id = bug ? 501 : 101;
    const row = await add(page, "lOgIn", { bug });
    const comparison = row.getByRole("combobox", { name: "Comparison", exact: true });
    await expect(comparison.locator("option")).toHaveText(["Contains", "Does not contain", "Starts with", "Equals"]);
    await colored(card(page, id), "blue"); await colored(card(page, id + 1), null); await colored(card(page, id + 2), "blue");
    await comparison.selectOption({ label: "Does not contain" });
    await colored(card(page, id), null); await colored(card(page, id + 1), "blue"); await colored(card(page, id + 2), null);
    for (const blank of ["", "   "]) { await row.getByRole("textbox").fill(blank); await colored(card(page, id), null); await colored(card(page, id + 1), null); }
    await row.getByRole("textbox").fill("Login"); await comparison.selectOption({ label: "Starts with" });
    await colored(card(page, id), "blue"); await colored(card(page, id + 2), null);
    await comparison.selectOption({ label: "Equals" }); await colored(card(page, id), null);
    await row.getByRole("textbox").fill("LOGIN PRÜFEN"); await colored(card(page, id), "blue");
    await row.getByRole("textbox").fill(" Login prüfen "); await colored(card(page, id), null);
    await comparison.selectOption({ label: "Contains" }); await row.getByRole("textbox").fill("Login.*");
    await colored(card(page, id), null);
    if (!bug) await colored(card(page, 104), "blue");
  });
  test(`CC-03 State and whole-Tag comparisons (${bug ? 'Bugs' : 'Test Cases'})`, async ({ page }) => {
    const id = bug ? 501 : 101;
    const row = await add(page, bug ? "Active" : "Ready", { bug, field: "State" });
    await expect(row.getByRole("combobox", { name: "Comparison", exact: true }).locator("option")).toHaveText(["Equals"]);
    await colored(card(page, id), "blue"); await colored(card(page, id + 1), null);
    await row.getByRole("combobox", { name: "Field", exact: true }).selectOption({ label: "Tag" });
    await row.getByRole("textbox").fill("Regression"); await colored(card(page, id), "blue"); await colored(card(page, id + 1), null);
  });
}

for (const bug of [false, true]) {
  test(`CC-07/13 colors have readable rails and tints in both themes (${bug ? 'Bugs' : 'Test Cases'})`, async ({ page }) => {
    const id = bug ? 501 : 101;
    const row = await add(page, "Login", { bug });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const baseline = await card(page, id + 1).evaluate(e => getComputedStyle(e).backgroundColor);
      const paints = new Set<string>();
      for (const [label, value] of [["Blue", "blue"], ["Orange", "orange"], ["Green", "green"], ["Violet", "violet"]]) {
        await row.getByRole("combobox", { name: "Color", exact: true }).selectOption({ label });
        await colored(card(page, id), value);
        // Let the existing short color transition settle before measuring the actual paint.
        await expect.poll(() => card(page, id).evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe(baseline);
        const paint = await card(page, id).evaluate(async e => {
          await Promise.all(e.getAnimations().map(animation => animation.finished));
          const style = getComputedStyle(e), text = getComputedStyle(e.querySelector('.relations-view-card-title')!);
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d')!;
          const luminance = (color: string) => {
            context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
            const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
          };
          const bg = luminance(style.backgroundColor), fg = luminance(text.color);
          return { rail: style.borderLeftColor, width: parseFloat(style.borderLeftWidth), fill: style.backgroundColor, contrast: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) };
        });
        expect(paint.width).toBeGreaterThanOrEqual(3); expect(paint.fill).not.toBe(baseline); expect(paint.contrast).toBeGreaterThanOrEqual(4.5); paints.add(paint.rail);
        await expect(card(page, id).getByLabel(bug ? "State: Active" : "Outcome: Passed")).toBeVisible();
        await expect(card(page, id)).toHaveAttribute("title", /Color rule.*Login/s);
      }
      expect(paints.size).toBe(4);
    }
  });
}

test("CC-09/10/11 lowdb round-trip, set isolation and last-rule deletion", async ({ page }) => {
  await add(page, "Login"); await add(page, "Export", { bug: true, color: "Orange" });
  await expect.poll(() => server.disk()).toContain("Login");
  await page.getByLabel("Harness Set").selectOption("set-b");
  await colored(card(page, 101), null); await colored(card(page, 502), null);
  await add(page, "Export", { color: "Green" });
  await expect.poll(() => server.disk()).toContain("green");
  await page.getByLabel("Harness Set").selectOption("set-a");
  await colored(card(page, 101), "blue"); await colored(card(page, 502), "orange");
  await expect.poll(() => server.disk()).toContain("orange");
  server.reopenDatabase(); await page.evaluate(() => localStorage.clear()); await page.reload();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false"); await expect(toggle(page, true)).toHaveAttribute("aria-expanded", "false");
  await colored(card(page, 101), "blue"); await colored(card(page, 502), "orange");
  await open(page); await rows(page).first().getByRole("button", { name: "Delete color rule" }).click();
  await expect.poll(() => server.disk()).not.toContain('"value":"Login"');
  // Wait for the persisted deletion, then verify by a fresh HTTP hydration without browser fallback.
  await expect.poll(async () => JSON.stringify((await (await page.request.get(server.origin + '/phase2/user-preferences')).json()).preferences)).not.toContain('"value":"Login"');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await colored(card(page, 101), null); await colored(card(page, 502), "orange");
  await page.getByLabel("Harness Set").selectOption("set-b"); await colored(card(page, 102), "green");
});

test("CC-11 save failures remain visible and recover after a successful edit", async ({ page }) => {
  await page.route("**/phase2/user-preferences", async route => route.request().method() === "POST" ? route.fulfill({ status: 500, body: '{}' }) : route.continue());
  const row = await add(page, "Login");
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await toggle(page).click(); await expect(page.getByRole("alert")).toContainText("could not be saved");
  await page.unroute("**/phase2/user-preferences"); await open(page);
  await row.getByRole("textbox").fill("Export"); await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => server.disk()).toContain("Export");
});

test("CC-12/13 refresh, filters, focus and relations keep their behavior", async ({ page }) => {
  const initialOrder = await page.locator('.relations-view-card').evaluateAll(cards => cards.map(c => c.getAttribute('data-item-key')));
  const conflict = page.locator('[data-line-id="101::501"] .relations-view-line-conflict .relations-view-line-stroke');
  await expect(conflict).toBeVisible(); const before = await conflict.evaluate(e => getComputedStyle(e).stroke);
  await add(page, "Login"); await add(page, "prüfen", { color: "Green" }); await add(page, "Login", { bug: true, color: "Orange" });
  await expect(card(page, 501).getByLabel("State: Active")).toBeVisible();
  expect(await page.locator('.relations-view-card').evaluateAll(cards => cards.map(c => c.getAttribute('data-item-key')))).toEqual(initialOrder);
  await expect(conflict).toBeVisible(); await expect(conflict).toHaveCSS("stroke", before);
  await card(page, 101).getByRole("button", { name: "Focus test case #101" }).click();
  await expect(page.locator('[data-line-id="101::501"]')).toHaveClass(/focus-conflict/);
  await expect(conflict).toHaveCSS("stroke", before);
  const search = page.getByRole("searchbox", { name: "Search Test cases" });
  await search.fill("Login"); await expect(card(page, 101).locator('mark')).toContainText("Login");
  await search.fill("Export"); await expect(card(page, 101)).toHaveCount(0);
  await search.fill(""); await colored(card(page, 101), "blue");
  await expect(rows(page).getByRole("textbox")).toHaveCount(2);
  await expect(rows(page).nth(0).getByRole("textbox")).toHaveValue("Login");
  await expect(rows(page).nth(1).getByRole("textbox")).toHaveValue("prüfen");
  await colored(card(page, 102), "green");
  await page.getByRole("button", { name: "Harness refresh" }).click();
  await colored(card(page, 101), null); await colored(card(page, 501), null);
  expect(server.mutations()).toBe(0);
});

test("CC-14 editor fits a narrow column and all actions support keyboard input", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  async function tabTo(target: Locator) {
    await expect(target).toBeVisible();
    for (let attempts = 0; attempts < 60; attempts++) {
      if (await target.evaluate(e => e === document.activeElement)) return;
      await page.keyboard.press("Tab");
    }
    await expect(target).toBeFocused();
  }
  await tabTo(toggle(page)); await page.keyboard.press("Space");
  const addButton = column(page).getByRole("button", { name: "Add color rule" });
  await tabTo(addButton); await page.keyboard.press("Enter");
  const row = rows(page).first();
  for (const control of await row.locator("input,select,button").all()) {
    await tabTo(control); await expect(control).toBeFocused();
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  }
  async function selectByKeyboard(name: string, label: string) {
    await tabTo(row.getByRole("combobox", { name, exact: true }));
    await page.keyboard.type(label);
    await page.keyboard.press("Tab");
  }
  await selectByKeyboard("Field", "Title");
  await selectByKeyboard("Comparison", "Does not contain");
  await expect(row.getByRole("combobox", { name: "Comparison", exact: true })).toHaveValue("notContains");
  await selectByKeyboard("Comparison", "Contains");
  await expect(row.getByRole("combobox", { name: "Comparison", exact: true })).toHaveValue("contains");
  await selectByKeyboard("Color", "Blue");
  await tabTo(row.getByRole("textbox")); await page.keyboard.type("Login"); await colored(card(page, 101), "blue");
  await tabTo(row.getByRole("button", { name: "Delete color rule" })); await page.keyboard.press("Enter");
  await expect(rows(page)).toHaveCount(0);
});
