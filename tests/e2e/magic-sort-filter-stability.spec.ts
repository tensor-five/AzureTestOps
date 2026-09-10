import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { expect, test, type Page } from "@playwright/test";

let server: Server;
let origin: string;
test.beforeAll(async () => {
  const result = await build({ entryPoints: ["tests/e2e/magic-sort-filter-stability-harness.tsx"], bundle: true, format: "iife", platform: "browser", write: false });
  const css = await Promise.all(["tokens", "base", "controls", "filters", "relations", "navigation"].map(name => readFile(`src/app/bootstrap/local-ui-${name}.css`, "utf8")));
  server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(`<style>${css.join("\n")}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing browser test server address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

async function geometry(page: Page) {
  return page.evaluate(() => {
    const bug = document.querySelector('[data-item-key="wi:201"]')!.getBoundingClientRect();
    const tc = document.querySelector('[data-item-key="tc:101:3"]')!.getBoundingClientRect();
    const rows = [...document.querySelectorAll(".relations-view-work-item-list > li")].map(node => node.getBoundingClientRect());
    return { distance: Math.abs(tc.top + tc.height / 2 - bug.top - bug.height / 2), pitch: rows.length > 1 ? rows[1]!.top - rows[0]!.top : rows[0]!.height };
  });
}

test("text-filtered single Bug gets spacers, remains aligned on reload, and all Bugs return when filters clear", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin);
  await page.getByRole("searchbox", { name: "Search Test cases" }).fill("Dataload");
  await page.getByRole("searchbox", { name: "Search Work items" }).fill("Dataload");
  await page.getByRole("checkbox", { name: "Add Spacer" }).check();
  await page.getByRole("button", { name: "Magic Sort Debug", exact: true }).click();
  await page.getByRole("button", { name: "Magic Sort", exact: true }).click();
  await expect(page.locator(".relations-view-work-item-spacer").first()).toBeVisible();
  const after = await geometry(page);
  expect(after.distance, await page.locator("[data-magic-sort-debug-report] pre").innerText()).toBeLessThanOrEqual(after.pitch / 2 + 1);
  await expect.poll(async () => JSON.parse(await page.locator("[data-magic-sort-debug-report] pre").innerText()).observed.state).toBe("measured");
  const report = JSON.parse(await page.locator("[data-magic-sort-debug-report] pre").innerText());
  expect(report.observed.deviations[0].delta).toBeLessThan(1);
  const spacerCount = await page.locator(".relations-view-work-item-spacer").count();
  await page.getByRole("button", { name: "Magic Sort", exact: true }).click();
  await expect(page.locator(".relations-view-work-item-spacer")).toHaveCount(spacerCount);
  await page.reload();
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
  const restored = await geometry(page);
  expect(restored.distance).toBeCloseTo(after.distance, 1);
  await page.getByRole("searchbox", { name: "Search Work items" }).fill("");
  await page.getByRole("searchbox", { name: "Search Test cases" }).fill("");
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(3);
});

test("a running animation stops when a text filter changes", async ({ page }) => {
  await page.goto(origin);
  await page.getByRole("checkbox", { name: "Add Spacer" }).check();
  await page.getByRole("button", { name: "Magic Sort", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search Work items" }).fill("Export");
  await expect(page.getByRole("button", { name: "Magic Sort", exact: true })).toBeEnabled();
  await expect(page.locator(".relations-view-card-work-item")).toHaveCount(1);
  await expect(page.locator('[data-item-key="wi:202"]')).toBeVisible();
});
