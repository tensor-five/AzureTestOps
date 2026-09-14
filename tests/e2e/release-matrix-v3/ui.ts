import { expect, type Page } from '@playwright/test';
export const nav = (page: Page) => page.getByRole('button', { name: 'Release-Matrix', exact: true });
export async function open(page: Page) {
    await nav(page).click();
    await expect(page.getByRole('table', { name: 'Release-Matrix', exact: true })).toBeVisible();
}
export const rows = (page: Page, environment: string, content: string, id: number) =>
    page.locator(`[data-matrix-row='${JSON.stringify([environment, content, id])}']`);
export const cell = (page: Page, environment: string, content: string, id: number, column = 'v21') =>
    rows(page, environment, content, id).locator(`[data-matrix-column="${column}"]`);
export const outcome = (page: Page, environment: string, content: string, id: number, column = 'v21') =>
    cell(page, environment, content, id, column).getByRole('combobox');
export const settings = (page: Page) => page.getByRole('button', { name: 'Spalten & Gruppierung', exact: true });
export const mapping = (page: Page, environment: string, content: string, title = '2.2.0') =>
    page.getByLabel(`Suite für ${environment} / ${content} / ${title}`, { exact: true });
export async function confirmed(page: Page, run = 100) {
    await expect(page.getByRole('status').filter({ hasText: new RegExp(`Durchlauf bestätigt.*${run}|${run}.*Durchlauf bestätigt`) })).toBeVisible();
}
