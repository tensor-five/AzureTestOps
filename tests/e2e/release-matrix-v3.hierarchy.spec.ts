import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { matrixConfig } from './release-matrix-v3/azure-fixture.js';
import { open, rows, cell, outcome, settings, mapping, nav, confirmed } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await server.reset(); await page.goto(server.origin); });

test('V3-H01 RM3-01 RM3-03 RM3-04 RM3-06 uses concrete versions and a catalog union of environment-content-case rows', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall', '2.1.0', '2.2.0']);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(13);
    for (const [env, content] of [['TST','Regression'], ['TST','Data Import'], ['ACC','Regression'], ['ACC','Data Import']])
        await expect(rows(page, env, content, 201)).toHaveCount(1);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'TST', 'Data Import', 201)).toHaveValue('Passed');
    await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
    await expect(outcome(page, 'ACC', 'Regression', 101)).toHaveValue('Blocked');
    await expect(rows(page, 'TST', 'Regression', 303)).toBeVisible(); // Only a different catalog version contains it.
    await expect(rows(page, 'TST', 'Data Import', 999)).toHaveCount(0); // Outside catalog, despite selected source.
    await settings(page).click(); await page.getByLabel('Stammsuite',{exact:true}).selectOption('1');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(14);
    await expect(rows(page,'TST','Data Import',999)).toHaveCount(1);
    await page.getByLabel('Stammsuite',{exact:true}).selectOption('20');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(12);
    await expect(rows(page,'TST','Regression',303)).toHaveCount(0);
    await expect(outcome(page,'TST','Regression',201,'v22')).toHaveValue('Passed');
    expect(server.azure().writes).toEqual([]);
});

test('V3-H02 RM3-02 renames a selected version by ID and disambiguates equal titles with paths and IDs', async ({ page }) => {
    await open(page);
    server.azure().suites.find(s => s.id === 20)!.name = 'Release 2.1.0 vollständiger Titel';
    server.azure().suites.find(s => s.id === 50)!.name = 'Release 2.1.0 vollständiger Titel';
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Release 2.1.0 vollständiger Titel', exact: true })).toBeVisible();
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await settings(page).click();
    const select = page.getByLabel('Versions-Suite 1', { exact: true });
    await expect(select).toHaveValue('20');
    await expect(select.locator('option[value="20"]')).toHaveText(/Katalog.*Release 2\.1\.0 vollständiger Titel.*20/);
    await expect(select.locator('option[value="50"]')).toHaveText(/Plan.*Release 2\.1\.0 vollständiger Titel.*50/);
    await select.selectOption('50');
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('NotRun');
});

test('V3-H03 RM3-02 a selected version outside the active plan is explained and cannot write', async ({ page }) => {
    server.azure().foreignSuites.add(30); await page.reload(); await open(page);
    await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveCount(0);
    await expect(cell(page, 'TST', 'Regression', 201, 'v22').getByRole('button')).toHaveAccessibleName(/ungültig|nicht.*Plan|Versions-Suite.*fehlt/i);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await settings(page).click(); await expect(page.getByLabel('Versions-Suite 2', { exact: true })).toHaveValue('30');
    expect(server.azure().writes).toEqual([]);
});

for (const [id, name] of [[31, 'tst'], [31, 'TST erweitert'], [32, 'regression'], [32, 'Regression erweitert']] as const) {
    test(`V3-H04 RM3-03 RM3-04 exact complete names reject source ${id} renamed ${name}`, async ({ page }) => {
        server.azure().suites.find(s => s.id === id)!.name = name;
        await page.reload(); await open(page);
        await expect(cell(page, 'TST', 'Regression', 201, 'v22').getByRole('button')).toHaveText('?');
        await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveCount(0);
        await server.seed({ ...matrixConfig, catalogRootId: 1 }); await page.reload(); await open(page);
        await expect(rows(page, 'TST', 'Regression', 201)).toHaveCount(1);
        await expect(rows(page, id === 31 ? name : 'TST', id === 32 ? name : 'Regression', 201)).toHaveCount(1);
        await expect(outcome(page, id === 31 ? name : 'TST', id === 32 ? name : 'Regression', 201, 'v22')).toHaveValue('Passed');
    });
}

test('V3-H05 RM3-03 RM3-07 descendants at an extra level never stand in for either direct child', async ({ page }) => {
    for (const level of ['environment', 'content']) {
        await server.reset();
        server.azure().suites.push({ id: 60, name: 'Zwischenordner', parentSuite: { id: level === 'environment' ? 30 : 31 }, suiteType: 'StaticTestSuite', queryString: undefined });
        server.azure().suites.find(s => s.id === (level === 'environment' ? 31 : 32))!.parentSuite = { id: 60 };
        await page.reload(); await open(page);
        await expect(cell(page, 'TST', 'Regression', 201, 'v22').getByRole('button')).toHaveText('?');
        await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveCount(0);
        await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
        expect(server.azure().writes).toEqual([]);
    }
});

test('V3-H06 RM3-07 distinguishes missing environments, missing contents and absent direct membership', async ({ page }) => {
    server.azure().suites.push({id:62,name:'Unterordner',parentSuite:{id:33},suiteType:'StaticTestSuite',queryString:undefined});
    server.azure().membership[62]=[203]; // A descendant member is not a direct content-suite member.
    await page.reload();
    await open(page);
    for (const [env, content, id] of [['PRD','Regression',101], ['ACC','Data Import',201]] as const) {
        const missing = cell(page, env, content, id, 'v22').getByRole('button');
        await expect(missing).toHaveText('?'); await missing.focus();
        await expect(page.getByRole('tooltip')).toContainText(/fehlt|nicht vorhanden/);
    }
    const absent = cell(page, 'TST', 'Data Import', 203, 'v22').getByRole('button');
    await expect(absent).toHaveText('·'); await absent.focus();
    await expect(page.getByRole('tooltip')).toContainText('Nicht in dieser Suite');
    expect(server.azure().writes).toEqual([]);
});

for (const duplicateEnvironment of [false, true]) {
    test(`V3-H07 RM3-07 RM3-09 resolves multiple direct paths only by concrete content selection (environment duplicate ${duplicateEnvironment})`, async ({ page }) => {
        if (duplicateEnvironment) server.azure().suites.push({ id: 60, name: 'TST', parentSuite: { id: 30 }, suiteType: 'StaticTestSuite', queryString: undefined });
        server.azure().suites.push({ id: 61, name: 'Regression', parentSuite: { id: duplicateEnvironment ? 60 : 31 }, suiteType: 'StaticTestSuite', queryString: undefined });
        server.azure().membership[61] = [201];
        await page.reload(); await open(page);
        await expect(cell(page, 'TST', 'Regression', 201, 'v22').getByRole('button', { name: /Suite zuordnen/ })).toBeVisible();
        await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveCount(0);
        await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
        await settings(page).click(); const choice = mapping(page, 'TST', 'Regression');
        await expect(choice.locator('option[value="32"]')).toHaveText(/2\.2\.0.*TST.*Regression.*32/);
        await expect(choice.locator('option[value="61"]')).toHaveText(/2\.2\.0.*TST.*Regression.*61/);
        await expect(choice.locator('option[value="22"]')).toHaveCount(0);
        await choice.selectOption('61'); await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('NotRun');
        await expect.poll(async () => JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].mappings[JSON.stringify(['TST','Regression','v22'])]).toBe(61);
        await page.evaluate(() => localStorage.clear()); await page.goto('about:blank'); await server.restart(); await page.goto(server.origin); await open(page);
        await outcome(page, 'TST', 'Regression', 201, 'v22').selectOption('Blocked'); await confirmed(page);
        expect(server.azure().writes.filter(w => w.method === 'POST')).toHaveLength(1);
        expect(server.azure().writes[0].body.pointIds).toEqual([61201]);
        await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    });
}

test('V3-H08 RM3-08 zero runs with valid points shows NotRun dash and permits a manual run', async ({ page }) => {
    server.azure().runs.splice(0); server.azure().results.splice(0);
    await page.reload(); await open(page);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('NotRun');
    await expect(cell(page, 'TST', 'Regression', 201).locator('.relations-view-outcome-chip')).toHaveText('—');
    await expect(outcome(page, 'TST', 'Regression', 201)).toBeEnabled();
    expect(server.azure().reads.some(url => new URL(url).pathname.endsWith('/runs'))).toBe(true);
    await outcome(page, 'TST', 'Regression', 201).selectOption('Passed'); await confirmed(page);
    expect(server.azure().writes[0].body.pointIds).toEqual([22201]);
});

test('V3-H09 RM3-11 parentless flat catalog still resolves the full loaded tree', async ({ page }) => {
    server.azure().control.flatParentsMissing = true;
    await page.reload(); await open(page);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(13);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
    await settings(page).click(); await expect(page.getByLabel('Versions-Suite 1', { exact: true }).locator('option[value="20"]')).toHaveText(/Katalog.*2\.1\.0.*20/);
});

for (const failure of ['tree-error', 'incomplete-tree'] as const) {
    test(`V3-H10 RM3-11 ${failure} is a load failure with no writable cells`, async ({ page }) => {
        if (failure === 'tree-error') server.azure().control.failTree = true;
        else server.azure().control.omittedTreeSuite = 32;
        await page.reload(); await nav(page).click();
        await expect(page.getByRole('alert').filter({ hasText: /Matrix|Hierarchie|Baum|Laden|Suite/i })).toBeVisible();
        await expect(page.locator('[data-matrix-row] select:enabled')).toHaveCount(0);
        await expect(page.getByText('Keine Testfälle für diese Filter.', { exact: true })).toHaveCount(0);
        expect(server.azure().writes).toEqual([]);
    });
}

test('V3-H11 RM3-11 failed tree refresh marks retained results stale and blocks writes until recovery', async ({ page }) => {
    await open(page); await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    server.azure().control.failTree = true;
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/Laden|Baum|Hierarchie|Suite/i);
    await expect(page.locator('[data-matrix-row] select:enabled')).toHaveCount(0);
    if (await outcome(page, 'TST', 'Regression', 201).count()) await expect(page.getByRole('alert')).toContainText(/veraltet/i);
    expect(server.azure().writes).toEqual([]);
    server.azure().control.failTree = false;
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(outcome(page, 'TST', 'Regression', 201)).toBeEnabled();
});

test('V3-H12 RM3-14 changing or removing all ancestor and concrete Suite tags changes no matrix source or Azure tags', async ({ page }) => {
    server.azure().control.failSuiteTags = true; // Suite-WIT tag availability is not a matrix prerequisite.
    await open(page);
    const rowKeys = await page.locator('[data-matrix-row]').evaluateAll(elements => elements.map(e => e.getAttribute('data-matrix-row')));
    for (const suite of server.azure().suites) server.azure().suiteTags[suite.id] = ['TST', '2.2.0', 'Regression'];
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
    for (const suite of server.azure().suites) server.azure().suiteTags[suite.id] = [];
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    expect(await page.locator('[data-matrix-row]').evaluateAll(elements => elements.map(e => e.getAttribute('data-matrix-row')))).toEqual(rowKeys);
    const before = structuredClone(server.azure().suiteTags);
    await outcome(page, 'TST', 'Regression', 201).selectOption('Blocked'); await confirmed(page);
    expect(server.azure().suiteTags).toEqual(before);
    expect(server.azure().writes.filter(write => write.method === 'POST')).toHaveLength(1);
    expect(server.azure().writes.every(write => new URL(write.url).pathname.includes('/runs'))).toBe(true);
    await settings(page).click(); await expect(page.getByLabel(/Suite-Tag|Release-Wurzel|Spaltenname|Umgebung \d/)).toHaveCount(0);
});
