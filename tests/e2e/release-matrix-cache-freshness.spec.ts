import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { open } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
    await server.reset();
    await page.goto(server.origin);
    await expect(page.locator('.relations-workspace')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh active set' })).toBeEnabled();
});

test('both views reuse completed history and the header retains its actual source date', async ({ page }) => {
    const resultReads = () => server.azure().reads.filter(url => /\/runs\/\d+\/results$/i.test(new URL(url).pathname)).length;
    const before = resultReads();
    expect(before).toBeGreaterThan(0);
    await open(page);
    await expect(page.locator('.ui-shell-data-state')).toHaveText('Gespeicherter Stand');
    expect(resultReads()).toBe(before);
    const date = await page.locator('.ui-shell-brand time').getAttribute('datetime');
    const response = page.waitForResponse(response => /\/release-matrix\?/.test(response.url()));
    await page.getByRole('button', { name: 'Refresh release matrix' }).click();
    const snapshot = await (await response).json();
    await expect(page.getByRole('button', { name: 'Refresh release matrix' })).toBeEnabled();
    expect(snapshot.freshness.cacheUsed).toBe(true);
    await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime', snapshot.freshness.sourceReadAt);
    expect(await page.locator('.ui-shell-brand time').getAttribute('datetime')).toBe(date);
    expect(resultReads()).toBe(before);
});

test('a pending or failed matrix refresh keeps the table and its old source date visible', async ({ page }) => {
    await open(page);
    const table = page.getByRole('table', { name: 'Release-Matrix', exact: true });
    const date = await page.locator('.ui-shell-brand time').getAttribute('datetime');
    let finish!: () => void;
    await page.route(/\/release-matrix\?/, async route => {
        await new Promise<void>(resolve => { finish = resolve; });
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Azure vorübergehend nicht erreichbar.' }) });
    });
    await page.getByRole('button', { name: 'Refresh release matrix' }).click();
    await expect(page.locator('.ui-shell-data-state')).toHaveText('Wird aktualisiert …');
    await expect(table).toBeVisible();
    await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime', date!);
    await expect.poll(() => typeof finish).toBe('function');
    finish();
    await expect(page.locator('.ui-shell-data-state')).toHaveText('Aktualisierung fehlgeschlagen · Alter Stand');
    await expect(table).toBeVisible();
    await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime', date!);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.locator('.ui-shell-data-state')).toBeVisible();
    const bounds = await page.locator('.ui-shell-data-freshness').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
});

test('a failed matching refresh retains the displayed data and reports the old stand in the header', async ({ page }) => {
    const date = await page.locator('.ui-shell-brand time').getAttribute('datetime');
    await page.route(/\/active-set\/snapshot\/stream\?/, async route => {
        await route.fulfill({ status: 200, contentType: 'text/event-stream',
            body: 'event: error\ndata: {"message":"Azure vorübergehend nicht erreichbar."}\n\n' });
    });
    await page.getByRole('button', { name: 'Refresh active set' }).click();
    await expect(page.locator('.ui-shell-data-state')).toHaveText('Aktualisierung fehlgeschlagen · Alter Stand');
    await expect(page.locator('.relations-workspace')).toBeVisible();
    await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime', date!);
});
