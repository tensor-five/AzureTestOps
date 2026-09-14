import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix/server.js';
import { matrixConfig } from './release-matrix/azure-fixture.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server.close(); });

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 600 }]) {
    test(`matrix scrolls within the viewport and keeps its headers fixed at ${viewport.width}px`, async ({ browser }) => {
        await server.reset({ ...matrixConfig, columns: Array.from({ length: 12 }, (_, index) => ({
            ...matrixConfig.columns[0], id: `column-${index}`, name: `Release ${index}`,
        })) });
        for (let id = 400; id < 460; id++) {
            server.azure().membership[11].push(id);
            server.azure().titles[id] = `Weiterer Test ${id}`;
        }
        const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
        const page = await context.newPage();
        try {
            await page.goto(server.origin);
            await page.getByRole('button', { name: 'Release-Matrix', exact: true }).click();
            const scroll = page.locator('[data-matrix-scroll]');
            await expect(scroll).toBeVisible();
            await scroll.scrollIntoViewIfNeeded();
            const size = await scroll.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
            expect(size.content).toBeGreaterThan(size.height);
            expect(size.height).toBeGreaterThanOrEqual(180);
            expect(size.height).toBeLessThan(viewport.height);
            await scroll.evaluate(element => { element.scrollTop = 320; element.scrollLeft = 250; });
            await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
            await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
            const bounds = (await scroll.boundingBox())!;
            const header = (await page.getByRole('columnheader', { name: 'Testfall', exact: true }).boundingBox())!;
            expect(header.y).toBeGreaterThanOrEqual(bounds.y);
            expect(header.y).toBeLessThan(bounds.y + 4);
            expect(header.x).toBeGreaterThanOrEqual(bounds.x);
            expect(header.x).toBeLessThan(bounds.x + 4);
        } finally {
            await context.close();
        }
    });
}
