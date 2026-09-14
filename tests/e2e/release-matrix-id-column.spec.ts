import { expect, test } from '@playwright/test';
import { addVersionColumns, matrixConfig } from './release-matrix-v3/azure-fixture.js';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { open, rows } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await server.reset(); await page.goto(server.origin); });

const headerText = (page: import('@playwright/test').Page) =>
  page.getByRole('table', { name: 'Release-Matrix' }).getByRole('columnheader').allTextContents();

test('keeps ID, title and the selected row context in distinct ordered columns', async ({ page }) => {
  await open(page);
  expect(await headerText(page)).toEqual(['ID', 'Titel', 'Inhalt', '2.1.0', '2.2.0']);

  let row = rows(page, 'TST', 'Regression', 201);
  await expect(row.getByRole('rowheader')).toHaveCount(1);
  await expect(row.getByRole('rowheader')).toHaveText('CSV importieren');
  await expect(row.locator('.matrix-case-id-cell')).toHaveText('#201');
  await expect(row.locator('.matrix-case-id-cell')).toHaveAttribute('aria-label', 'Testfall-ID 201');
  expect(await row.locator(':scope > *').evaluateAll(elements => elements.slice(0, 3).map(element => element.textContent?.trim()))).toEqual([
    '#201', 'CSV importieren', 'Regression'
  ]);

  await page.getByLabel('Gruppieren nach', { exact: true }).selectOption('content');
  expect(await headerText(page)).toEqual(['ID', 'Titel', 'Umgebung', '2.1.0', '2.2.0']);
  row = rows(page, 'TST', 'Regression', 201);
  expect(await row.locator(':scope > *').evaluateAll(elements => elements.slice(0, 3).map(element => element.textContent?.trim()))).toEqual([
    '#201', 'CSV importieren', 'TST'
  ]);

  await page.getByRole('checkbox', { name: 'Umgebungen getrennt anzeigen' }).uncheck();
  expect(await headerText(page)).toEqual(['ID', 'Titel', '2.1.0', '2.2.0']);
  const combined = page.locator(`[data-matrix-row='["Regression",201]']`);
  await expect(combined.getByRole('rowheader')).toHaveCount(1);
  expect(await combined.locator(':scope > *').evaluateAll(elements => elements.slice(0, 2).map(element => element.textContent?.trim()))).toEqual([
    '#201', 'CSV importieren'
  ]);
  expect(server.azure().writes).toEqual([]);
});

test('keeps both identity columns sticky while context and status columns scroll', async ({ page }) => {
  await server.seed({ ...matrixConfig, columns: addVersionColumns(server.azure(), 12) });
  await page.reload();
  await open(page);
  const scroll = page.locator('[data-matrix-scroll]');
  const row = rows(page, 'TST', 'Regression', 201);
  const before = await page.evaluate(() => {
    const bounds = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    return {
      idHeader: bounds('.matrix-id-header').x,
      titleHeader: bounds('.matrix-title-header').x,
      idCell: bounds('.matrix-case-id-cell').x,
      titleCell: bounds('.matrix-case-title').x,
      context: bounds('.matrix-context-cell').x
    };
  });
  await scroll.evaluate(element => { element.scrollLeft = 180; });
  await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const after = await page.evaluate(() => {
    const bounds = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    return {
      idHeader: bounds('.matrix-id-header').x,
      titleHeader: bounds('.matrix-title-header').x,
      idCell: bounds('.matrix-case-id-cell').x,
      titleCell: bounds('.matrix-case-title').x,
      context: bounds('.matrix-context-cell').x
    };
  });
  expect(Math.abs(after.idHeader - before.idHeader)).toBeLessThan(1);
  expect(Math.abs(after.titleHeader - before.titleHeader)).toBeLessThan(1);
  expect(Math.abs(after.idCell - before.idCell)).toBeLessThan(1);
  expect(Math.abs(after.titleCell - before.titleCell)).toBeLessThan(1);
  expect(after.context).toBeLessThan(before.context);
  await expect(row.locator('.matrix-case-id-cell')).toBeVisible();
  await expect(row.getByRole('rowheader')).toBeVisible();
  expect(server.azure().writes).toEqual([]);
});
