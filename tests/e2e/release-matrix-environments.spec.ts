import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { open } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async () => { await server.reset(); });

test('combines environments without reloading Azure and restores the choice from lowdb after restart', async ({ page }) => {
  // In this comparison 101 exists only in ACC for v21 and only in TST for v22.
  for (const suite of [22, 28, 35]) server.azure().membership[suite] = server.azure().membership[suite].filter(id => id !== 101);
  await page.goto(server.origin);
  await open(page);
  const checkbox = page.getByRole('checkbox', { name: 'Umgebungen getrennt anzeigen' });
  await expect(checkbox).toBeChecked();
  const initialReads = server.azure().reads.length;
  await checkbox.uncheck();
  const row = page.locator(`[data-matrix-row='["Regression",101]']`);
  await expect(row).toHaveCount(1);
  await expect(row.locator('[data-matrix-column="v21"] .matrix-cell-control select')).toHaveValue('Blocked');
  await expect(row.locator('[data-matrix-column="v22"] .matrix-cell-control select')).toHaveValue('NotRun');
  expect(server.azure().reads.length).toBe(initialReads);
  expect(server.azure().writes).toHaveLength(0);
  await expect.poll(async () => JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].separateEnvironments).toBe(false);
  await server.restart();
  await page.reload();
  await open(page);
  await expect(checkbox).not.toBeChecked();
  await expect(row).toHaveCount(1);
  await checkbox.check();
  await expect(page.locator(`[data-matrix-row='["ACC","Regression",101]']`)).toHaveCount(1);
  await expect(page.locator(`[data-matrix-row='["TST","Regression",101]']`)).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Gruppieren nach', exact: true })).toHaveValue('environment');
});

test('requires a concrete source and writes only its test point, preserving other environments', async ({ page }) => {
  await page.goto(server.origin);
  await open(page);
  await page.getByRole('checkbox', { name: 'Umgebungen getrennt anzeigen' }).uncheck();
  const row = page.locator(`[data-matrix-row='["Regression",101]']`);
  const cell = row.locator('[data-matrix-column="v21"]');
  await expect(cell.locator('.matrix-cell-control select')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Umgebung für Regression / #101 / 2.1.0', exact: true }).selectOption('25');
  const outcome = cell.locator('.matrix-cell-control select');
  await expect(outcome).toHaveValue('Blocked');
  expect(server.azure().writes).toHaveLength(0);
  await outcome.focus();
  await expect(page.getByRole('tooltip')).toContainText('ACC');
  await outcome.selectOption('Failed');
  await expect(outcome).toHaveValue('Failed');
  await expect(outcome).toBeEnabled();
  expect(server.azure().writes.filter(write => write.method === 'POST').map(write => write.body.pointIds)).toEqual([[25101]]);
  await page.getByRole('checkbox', { name: 'Umgebungen getrennt anzeigen' }).check();
  await expect(page.locator(`[data-matrix-row='["ACC","Regression",101]'] [data-matrix-column="v21"] select`)).toHaveValue('Failed');
  await expect(page.locator(`[data-matrix-row='["TST","Regression",101]'] [data-matrix-column="v21"] select`)).toHaveValue('Passed');
});
