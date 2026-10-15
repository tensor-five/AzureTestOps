import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { open, outcome, settings, confirmed } from './release-matrix-v3/ui.js';

test('per-column environment checkbox controls physical reads, writes and lowdb persistence',async({page},testInfo)=>{
    const server=await startMatrixServer();
    try {
        // One version retains environments; the other has direct content suites.
        for(const id of [32,33]) server.azure().suites.find(suite=>suite.id===id)!.parentSuite={id:30};
        await page.goto(server.origin);await open(page);await settings(page).click();
        const first=page.getByRole('checkbox',{name:'Umgebungsebene vorhanden für Spalte 1',exact:true});
        const second=page.getByRole('checkbox',{name:'Umgebungsebene vorhanden für Spalte 2',exact:true});
        await expect(first).toBeChecked();await expect(second).toBeChecked();
        await second.uncheck();
        await expect(outcome(page,'TST','Regression',201,'v22')).toHaveValue('Passed');
        await expect(first).toBeChecked();
        expect(server.azure().writes).toEqual([]);
        await outcome(page,'TST','Regression',201,'v22').selectOption('Blocked');await confirmed(page);
        expect(server.azure().writes.find(write=>write.method==='POST')?.body.pointIds).toEqual([32201]);
        await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');
        await expect(outcome(page,'ACC','Regression',201,'v22')).toHaveValue('Blocked');
        await expect.poll(async()=>JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].columns[1].hasEnvironmentLevel).toBe(false);
        await page.evaluate(()=>localStorage.clear());await page.goto('about:blank');await server.restart();
        await page.goto(server.origin);await open(page);await settings(page).click();
        await expect(second).not.toBeChecked();await expect(first).toBeChecked();
        await expect(outcome(page,'TST','Regression',201,'v22')).toHaveValue('Blocked');
        await page.screenshot({path:testInfo.outputPath('column-hierarchy.png'),fullPage:true});
    } finally {await server.close();}
});
