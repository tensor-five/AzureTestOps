import { expect, test } from '@playwright/test';
import { matrixConfig } from './release-matrix-v3/azure-fixture.js';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { open, outcome } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
  await server.reset();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.origin);
});

test('resizes every sticky title surface on desktop', async ({ page }) => {
  await server.seed({ ...matrixConfig, testCaseColumnWidth: 350 });
  await page.reload();
  await open(page);
  const handle = page.getByRole('separator', { name: 'Breite der Testfallspalte ändern' });
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 250, bounds.y + bounds.height / 2);
  await page.mouse.up();

  await expect(handle).toHaveAttribute('aria-valuenow', '600');
  await expect.poll(async () => JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].testCaseColumnWidth).toBe(600);
  const widths = await page.evaluate(() => ({
    idHeader: document.querySelector<HTMLElement>('.matrix-id-header')!.getBoundingClientRect().width,
    idCell: document.querySelector<HTMLElement>('.matrix-case-id-cell')!.getBoundingClientRect().width,
    titleHeader: document.querySelector<HTMLElement>('.matrix-title-header')!.getBoundingClientRect().width,
    titleCell: document.querySelector<HTMLElement>('.matrix-case-title')!.getBoundingClientRect().width,
    group: document.querySelector<HTMLElement>('.matrix-group-row th > div')!.getBoundingClientRect().width
  }));
  expect(Math.abs(widths.idHeader - 96)).toBeLessThan(1);
  expect(Math.abs(widths.idCell - 96)).toBeLessThan(1);
  expect(Math.abs(widths.titleHeader - 600)).toBeLessThan(1);
  expect(Math.abs(widths.titleCell - 600)).toBeLessThan(1);
  expect(Math.abs(widths.group - 696)).toBeLessThan(1);
  expect(await page.locator('.matrix-case-title').first().evaluate(element => getComputedStyle(element).whiteSpace)).toBe('nowrap');
  expect(server.azure().writes).toEqual([]);
});

test('caps the sticky title column and disables resizing on a touch viewport', async ({ browser }) => {
  await server.seed({ ...matrixConfig, testCaseColumnWidth: 600 });
  const context = await browser.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(server.origin);
    await open(page);
    await expect(page.getByRole('separator', { name: 'Breite der Testfallspalte ändern' })).toHaveCount(0);
    const widths = await page.evaluate(() => ({
      idHeader: document.querySelector<HTMLElement>('.matrix-id-header')!.getBoundingClientRect().width,
      idCell: document.querySelector<HTMLElement>('.matrix-case-id-cell')!.getBoundingClientRect().width,
      titleHeader: document.querySelector<HTMLElement>('.matrix-title-header')!.getBoundingClientRect().width,
      titleCell: document.querySelector<HTMLElement>('.matrix-case-title')!.getBoundingClientRect().width,
      group: document.querySelector<HTMLElement>('.matrix-group-row th > div')!.getBoundingClientRect().width
    }));
    expect(Math.abs(widths.idHeader - 96)).toBeLessThan(1);
    expect(Math.abs(widths.idCell - 96)).toBeLessThan(1);
    expect(Math.abs(widths.titleHeader - 112)).toBeLessThan(1);
    expect(Math.abs(widths.titleCell - 112)).toBeLessThan(1);
    expect(Math.abs(widths.group - 208)).toBeLessThan(1);
    const scroll = page.locator('[data-matrix-scroll]');
    expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await outcome(page, 'TST', 'Regression', 201).tap();
    expect(server.azure().writes).toEqual([]);
  } finally {
    await context.close();
  }
});
