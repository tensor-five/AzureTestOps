import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { cell, open, outcome } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
let staleReset = false;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({page}) => {
  await server.reset(); staleReset = false;
  const azure = server.azure(), active = new Set<number>();
  const originalGet = azure.client.get.bind(azure.client);
  azure.client.get = async url => {
    const response = await originalGet(url);
    if (!/\/points\?/i.test(url) || staleReset) return response;
    const body = response.json as {value: Array<Record<string, unknown>>};
    return {...response, json: {...body, value: body.value.map(point => active.has(Number(point.id))
      ? {...point, state: 'Ready', outcome: 'Unspecified', lastTestRun: {id: '0'}, lastResult: {id: '0'}} : point)}};
  };
  const originalPatch = azure.client.patch.bind(azure.client);
  azure.client.patch = async (url, body) => {
    const match = new URL(url).pathname.match(/\/points\/(\d+)$/i);
    if (!match) return originalPatch(url, body);
    expect(body).toEqual({resetToActive: true});
    azure.writes.push({method: 'PATCH', url, body}); active.add(Number(match[1]));
    return {status: 200, json: {}};
  };
  const originalPost = azure.client.post.bind(azure.client);
  azure.client.post = async (url, body) => {
    const response = await originalPost(url, body);
    if (/\/runs\?/i.test(url)) for (const pointId of body.pointIds) active.delete(pointId);
    return response;
  };
  await page.goto(server.origin);
});

test('reset updates the exact point in both views, survives reload and allows a later result', async ({page}) => {
  const matchingChip = page.locator('article[data-item-key="tc:201:22"] .relations-view-outcome-chip').first();
  await expect(matchingChip).toHaveText('✗');
  await open(page);
  const target = outcome(page, 'TST', 'Regression', 201);
  await target.selectOption({label: 'Reset to active'});
  await expect(target).toHaveValue('Unspecified');
  const chip = cell(page, 'TST', 'Regression', 201).locator('.relations-view-outcome-chip');
  await expect(chip).toHaveText('ACT');
  await expect(chip).toHaveClass(/outcome-chip-active/);
  await target.hover();
  await expect(page.getByRole('tooltip')).toContainText('Active');
  await expect(page.getByRole('tooltip')).not.toContainText('Unspecified');
  await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
  expect(server.azure().runs).toHaveLength(1);
  expect(server.azure().writes).toHaveLength(1);
  expect(server.azure().writes[0].url).toContain('/Suites/22/points/22201?');
  await page.getByRole('button', {name: 'Zuordnung', exact: true}).click();
  await expect(matchingChip).toHaveText('ACT');
  await expect(matchingChip).toHaveAttribute('aria-label', 'Outcome: Active');
  await page.reload(); await expect(matchingChip).toHaveText('ACT');
  await open(page); await expect(target).toHaveValue('Unspecified');
  await target.selectOption('Failed'); await expect(target).toHaveValue('Failed');
  await expect(chip).toHaveText('✗');
  await page.getByRole('button', {name: 'Zuordnung', exact: true}).click();
  await expect(matchingChip).toHaveText('✗');
});

test('an unconfirmed reset stays locked until a fresh active point is read without retrying', async ({page}) => {
  staleReset = true; await open(page);
  const target = outcome(page, 'TST', 'Regression', 201);
  await target.selectOption('ResetToActive');
  await expect(page.getByRole('alert')).toContainText('Reset auf Active');
  await expect(target).toBeDisabled();
  expect(server.azure().writes).toHaveLength(1);
  staleReset = false;
  await page.getByRole('button', {name: 'Matrix aktualisieren', exact: true}).click();
  await expect(target).toHaveValue('Unspecified'); await expect(target).toBeEnabled();
  expect(server.azure().writes).toHaveLength(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const theme of ['light', 'dark']) test(`status colors match between both views in ${theme} theme`, async ({page}) => {
  await server.patch({themeMode: theme}); await page.reload(); await open(page);
  const target = outcome(page, 'TST', 'Regression', 201);
  const chip = cell(page, 'TST', 'Regression', 201).locator('.relations-view-outcome-chip');
  const colors = new Set<string>();
  for (const [value, slug] of [['Failed', 'failed'], ['NotApplicable', 'notapplicable'], ['ResetToActive', 'active']]) {
    await target.selectOption(value);
    await expect(chip).toHaveClass(new RegExp(`outcome-chip-${slug}`));
    const color = await chip.evaluate(element => getComputedStyle(element).backgroundColor);
    colors.add(color);
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
    await page.getByRole('button', {name: 'Zuordnung', exact: true}).click();
    const matching = page.locator('article[data-item-key="tc:201:22"] .relations-view-outcome-chip').first();
    await expect(matching).toHaveClass(new RegExp(`outcome-chip-${slug}`));
    expect(await matching.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(color);
    await open(page);
  }
  expect(colors.size).toBe(3);
});

for (const [action, expectedReads, expectedWrites, display] of [
  ['NotApplicable', 7, 3, 'NotApplicable'], ['ResetToActive', 4, 1, 'Unspecified'],
] as const) test(`confirmed ${action} patches both views without a matrix or history reload`, async ({page}) => {
  await open(page);
  const target = outcome(page, 'TST', 'Regression', 201);
  await expect(target).toBeEnabled();
  const azure = server.azure();
  azure.reads.length = 0; azure.writes.length = 0;
  const matrixReads: string[] = [];
  page.on('request', request => {
    if (request.method() === 'GET' && /release-matrix(?:\?|$)/.test(request.url())) matrixReads.push(request.url());
  });
  const saved = page.waitForResponse(response => response.url().endsWith('/release-matrix/outcomes'));
  await target.selectOption(action);
  const response = await saved;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(Object.keys(result.projection).sort()).toEqual(['lastOutcome', 'lastResultCompletedDate', 'lastResultId', 'lastRunId', 'suiteId', 'testPointId', 'workItemId']);
  await expect(target).toHaveValue(display); await expect(target).toBeEnabled();
  await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
  expect(azure.reads).toHaveLength(expectedReads);
  expect(azure.writes).toHaveLength(expectedWrites);
  expect(azure.reads.every(url => /\/testcases\/201\?|\/points\?testCaseId=201&|\/runs\/100(?:\?|\/results(?:\/1000)?\?)/i.test(url))).toBe(true);
  await page.getByRole('button', {name: 'Zuordnung', exact: true}).click();
  const chip = page.locator('article[data-item-key="tc:201:22"] .relations-view-outcome-chip').first();
  await expect(chip).toHaveAttribute('aria-label', action === 'ResetToActive' ? 'Outcome: Active' : 'Outcome: NotApplicable');
  expect(matrixReads).toEqual([]);
});
