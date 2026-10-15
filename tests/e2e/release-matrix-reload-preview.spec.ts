import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { open } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => {server = await startMatrixServer();});
test.afterAll(async () => {await server?.close();});
test.beforeEach(async ({page}) => {
  await server.reset();
  await page.goto(server.origin);
  await expect(page.locator('.relations-workspace')).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh active set'})).toBeEnabled();
});

for (const failure of [false,true]) test(`matching reload shows its previous snapshot before Azure finishes, failure ${failure}`, async ({page}) => {
  const previousDate = await page.locator('.ui-shell-brand time').getAttribute('datetime');
  const original = server.azure().client.get.bind(server.azure().client);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release=resolve;});
  server.azure().client.get = async url => {
    if (/\/suites$/i.test(new URL(url).pathname)) {
      await gate;
      if (failure) return {status:400,json:{}};
    }
    return original(url);
  };
  try {
    await page.reload();
    await expect(page.locator('.relations-workspace')).toBeVisible();
    await expect(page.locator('.ui-shell-data-state')).toHaveText('Wird aktualisiert …');
    await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime',previousDate!);
    await expect(page.getByRole('button',{name:'Refresh active set'})).toBeDisabled();
    server.azure().titles[201] = 'Aktualisierter CSV-Import';
    release();
    await expect(page.getByRole('button',{name:'Refresh active set'})).toBeEnabled();
    if (failure) {
      await expect(page.locator('.ui-shell-data-state')).toHaveText('Aktualisierung fehlgeschlagen · Alter Stand');
      await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime',previousDate!);
    } else await expect(page.locator('.relations-workspace')).toContainText('Aktualisierter CSV-Import');
    await expect(page.locator('.relations-workspace')).toBeVisible();
  } finally {release();server.azure().client.get=original;}
});

for (const failure of [false,true]) test(`matrix reload restores the selected view and preview while its fresh read is pending, failure ${failure}`, async ({page}) => {
  await open(page);
  await expect(page.getByRole('button',{name:'Refresh release matrix'})).toBeEnabled();
  const previousDate = await page.locator('.ui-shell-brand time').getAttribute('datetime');
  const before = server.azure().reads.length;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release=resolve;});
  await page.route(/\/release-matrix\?/,async route => {
    if (new URL(route.request().url()).searchParams.get('cache') === 'only') return route.continue();
    await gate;
    if (failure) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Azure unavailable'})});
    else await route.continue();
  });
  try {
    await page.reload();
    await expect(page.getByRole('button',{name:'Release-Matrix',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('table',{name:'Release-Matrix',exact:true})).toBeVisible();
    await expect(page.locator('.ui-shell-data-state')).toHaveText('Wird aktualisiert …');
    await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime',previousDate!);
    await expect(page.locator('[data-matrix-row] select:enabled')).toHaveCount(0);
    expect(server.azure().reads).toHaveLength(before);
    server.azure().titles[201] = 'Aktualisierter CSV-Import';
    release();
    await expect(page.getByRole('button',{name:'Refresh release matrix'})).toBeEnabled();
    if (failure) {
      await expect(page.locator('.ui-shell-data-state')).toHaveText('Aktualisierung fehlgeschlagen · Alter Stand');
      await expect(page.locator('.ui-shell-brand time')).toHaveAttribute('datetime',previousDate!);
      await expect(page.locator('[data-matrix-row] select:enabled')).toHaveCount(0);
    } else await expect(page.getByRole('table',{name:'Release-Matrix',exact:true})).toContainText('Aktualisierter CSV-Import');
  } finally {release();}
});
