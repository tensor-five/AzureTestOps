import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { matrixConfig } from './release-matrix-v3/azure-fixture.js';
import { nav, open, rows, cell, outcome, settings, mapping } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await server.reset(); await page.goto(server.origin); });

const rowKeys = (page: import('@playwright/test').Page) => page.locator('[data-matrix-row]').evaluateAll(elements => elements.map(e => e.getAttribute('data-matrix-row')).sort());
const chooseVersions = (columns: typeof matrixConfig.columns) => server.seed({ ...matrixConfig, columns });
const version = (versionSuiteId: number, id = `selected-${versionSuiteId}`, visible = true) => ({ id, versionSuiteId, visible });
function suite(id: number, name: string, parent: number) {
    server.azure().suites.push({ id, name, parentSuite: { id: parent }, suiteType: 'StaticTestSuite', queryString: undefined });
}

test('V4-S01 RM4-02 RM4-05 direct relative depth excludes version, environment and nested cases while selected archives are allowed', async ({ page }) => {
    suite(70, 'Releasearchiv', 10);
    server.azure().suites.find(s => s.id === 40)!.parentSuite = { id: 70 };
    suite(80, '2.0.1', 70); suite(81, 'TST', 80);
    server.azure().membership[81] = [801]; server.azure().titles[801] = 'Altfall direkt an Umgebung';
    suite(82, 'Unterordner', 22);
    server.azure().membership[20] = [802]; server.azure().titles[802] = 'Direkt an Version';
    server.azure().membership[21] = [803]; server.azure().titles[803] = 'Direkt an Umgebung';
    server.azure().membership[82] = [804]; server.azure().titles[804] = 'Tiefer als Inhalt';
    // Version 20 is several levels deep; version 30 is directly below the plan.
    suite(71, 'Aktuelle Releases', 10);
    server.azure().suites.find(s => s.id === 20)!.parentSuite = { id: 71 };
    await page.reload(); await open(page);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(13);
    await expect(rows(page, 'TST', 'Regression', 303)).toHaveCount(0);
    for (const id of [801,802,803,804]) await expect(page.locator(`[data-matrix-row$=',${id}]']`)).toHaveCount(0);
    await expect(page.locator('[data-matrix-group]')).not.toContainText(['Releasearchiv', '2.0.1']);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
    await chooseVersions([version(40)]); await page.reload(); await open(page);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(2);
    await expect(rows(page, 'TST', 'Regression', 303)).toHaveCount(1);
    await expect(outcome(page, 'TST', 'Regression', 303, 'selected-40')).toHaveValue('NotRun');
    await chooseVersions([version(80)]); await page.reload(); await nav(page).click();
    await expect(page.getByRole('columnheader', { name: '2.0.1', exact: true })).toBeVisible();
    await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
    expect(server.azure().writes).toEqual([]);
});

test('V4-S02 RM4-01 RM4-04 adding changing hiding showing removing and reordering recomputes membership', async ({ page }) => {
    await open(page); await settings(page).click();
    await expect(rows(page, 'TST', 'Regression', 303)).toHaveCount(0);
    await expect(rows(page, 'TST', 'Data Import', 999)).toHaveCount(1);
    const original = await rowKeys(page);
    await page.getByRole('button', { name: 'Spalte 2 nach links', exact: true }).click();
    expect(await rowKeys(page)).toEqual(original);
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall','2.2.0','2.1.0']);
    await page.getByLabel('Spalte 1 anzeigen', { exact: true }).uncheck();
    await expect(rows(page, 'TST', 'Data Import', 999)).toHaveCount(0);
    await expect(rows(page, 'TST', 'Data Import', 203)).toHaveCount(1);
    await page.getByLabel('Spalte 1 anzeigen', { exact: true }).check();
    await expect(rows(page, 'TST', 'Data Import', 999)).toHaveCount(1);
    await page.getByRole('button', { name: 'Spalte hinzufügen', exact: true }).click();
    await expect(page.getByLabel('Versions-Suite 3', { exact: true })).toHaveValue('0');
    expect(await rowKeys(page)).toEqual(original);
    await page.getByLabel('Versions-Suite 3', { exact: true }).selectOption('40');
    await expect(rows(page, 'TST', 'Regression', 303)).toHaveCount(1);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(14);
    await page.getByLabel('Versions-Suite 3', { exact: true }).selectOption('50');
    await expect(rows(page, 'TST', 'Regression', 303)).toHaveCount(0);
    expect(await rowKeys(page)).toEqual(original);
    await page.getByRole('button', { name: 'Spalte 1 entfernen', exact: true }).click();
    await expect(rows(page, 'TST', 'Data Import', 999)).toHaveCount(0);
    await expect(rows(page, 'TST', 'Regression', 201)).toHaveCount(1);
    await page.getByRole('button', { name: 'Spalte 1 entfernen', exact: true }).click();
    await expect(page.locator('[data-matrix-row]')).toHaveCount(1);
    await expect(rows(page, 'TST', 'Regression', 201)).toHaveCount(1);
    await page.getByRole('button', { name: 'Spalte 1 entfernen', exact: true }).click();
    await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
    await expect(page.getByText(/Versions.*auswählen|Versions.*wählen/i).first()).toBeVisible();
    expect(server.azure().writes).toEqual([]);
});

for (const [name, columns] of [
    ['no columns', []],
    ['all hidden', [version(20, 'hidden', false)]],
    ['unselected column', [version(0)]],
    ['missing version', [version(99999)]],
    ['foreign version', [version(30)]]
] as const) {
    test(`V4-S03 RM4-04 ${name} shows no rows and a version-selection explanation`, async ({ page }) => {
        if (name === 'foreign version') server.azure().foreignSuites.add(30);
        await chooseVersions([...columns]); await page.reload(); await nav(page).click();
        await expect(page.getByText(/Versions.*auswählen|Versions.*wählen/i).first()).toBeVisible();
        await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
        await expect(page.locator('[data-matrix-row] select:enabled')).toHaveCount(0);
        if (name === 'missing version' || name === 'foreign version') {
            await settings(page).click();
            const select = page.getByLabel('Versions-Suite 1', { exact: true });
            await expect(select).toHaveValue(String(columns[0].versionSuiteId));
            await expect(select.locator('option:checked')).toContainText('ungültig');
        }
        expect(server.azure().writes).toEqual([]);
    });
}

test('V4-S04 RM4-01 RM4-04 a selected suite leaving the plan removes its unique rows while retaining its invalid column', async ({ page }) => {
    await open(page);
    await expect(rows(page, 'TST', 'Data Import', 999)).toHaveCount(1);
    server.azure().foreignSuites.add(30);
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(rows(page, 'TST', 'Data Import', 999)).toHaveCount(0);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(12);
    await expect(cell(page, 'TST', 'Regression', 201, 'v22').getByRole('button')).toHaveAccessibleName(/ungültig|nicht.*Plan|Versions-Suite.*fehlt/i);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    expect(server.azure().writes).toEqual([]);
});

test('V4-S05 RM4-06 existing v3 state retains columns mappings filters groups and matching setup through LowDB reload', async ({ page }) => {
    suite(61, 'Regression', 31); server.azure().membership[61] = [201];
    const config = { ...matrixConfig, catalogRootId: 99999, grouping: 'content',
        columns: [version(30,'v22'),version(40,'old',false),version(20,'v21')],
        mappings: { '["TST","Regression","v22"]': 61 },
        search:'201', tagFilter:'Regression', suiteFilter:'32',
        groupOrderByMode:{ environment:['ACC','TST','PRD'],content:['Regression','Data Import'] },
        collapsedByMode:{ environment:['ACC'],content:['Data Import'] }
    };
    await server.seed(config);
    await server.patch({ setLayouts:{'matrix-set':{positions:{'tc:201:22':{x:12,y:34}}}} });
    const before = JSON.parse(await server.disk()).users.contract;
    await page.reload(); await open(page); await settings(page).click();
    await expect(page.getByLabel('Stammsuite',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall','2.2.0','2.1.0']);
    await expect(page.getByLabel('Versions-Suite 2',{exact:true})).toHaveValue('40');
    await expect(page.getByLabel('Spalte 2 anzeigen',{exact:true})).not.toBeChecked();
    await expect(page.getByLabel('Gruppieren nach',{exact:true})).toHaveValue('content');
    await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('201');
    await expect(page.getByLabel('Tag',{exact:true})).toHaveValue('Regression');
    await expect(page.getByLabel('In Testsuite',{exact:true})).toHaveValue('32');
    await expect(mapping(page,'TST','Regression')).toHaveValue('61');
    await expect(outcome(page,'TST','Regression',201,'v22')).toHaveValue('NotRun');
    await expect(page.getByRole('button',{name:'Gruppe Data Import aufklappen',exact:true})).toBeVisible();
    await page.getByLabel('Testfall suchen',{exact:true}).fill('CSV');
    await expect.poll(async()=>JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].search).toBe('CSV');
    const stored=JSON.parse(await server.disk()).users.contract;
    for (const key of ['columns','mappings','groupOrderByMode','collapsedByMode','grouping','tagFilter','suiteFilter'] as const)
        expect(stored.setReleaseMatrices['matrix-set'][key]).toEqual(config[key]);
    for (const key of ['sets','activeSetId','adoContext','setLayouts']) expect(stored[key]).toEqual(before[key]);
    await page.evaluate(()=>localStorage.clear()); await page.goto('about:blank'); await server.restart(); await page.goto(server.origin); await open(page);
    await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('CSV');
    await expect(outcome(page,'TST','Regression',201,'v22')).toHaveValue('NotRun');
    await page.getByRole('button',{name:'Zuordnung',exact:true}).click();
    await expect(nav(page)).toBeVisible();
    const after=JSON.parse(await server.disk()).users.contract;
    for (const key of ['sets','activeSetId','adoContext','setLayouts']) expect(after[key]).toEqual(before[key]);
    expect(server.azure().writes).toEqual([]);
});

test('V4-S06 RM4-07 search tag and membership filters only narrow selected-version rows', async ({ page }) => {
    await open(page);
    await page.getByLabel('Testfall suchen',{exact:true}).fill('303');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
    await page.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
    await page.getByLabel('Tag',{exact:true}).selectOption('Regress');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
    await page.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
    await page.getByLabel('In Testsuite',{exact:true}).selectOption('42');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(3);
    await expect(rows(page,'TST','Regression',303)).toHaveCount(0);
    await expect(outcome(page,'TST','Regression',101)).toHaveValue('Passed');
    await page.getByRole('button',{name:'Filter zurücksetzen',exact:true}).click();
    await expect(page.locator('[data-matrix-row]')).toHaveCount(13);
    await expect(rows(page,'TST','Data Import',999)).toHaveCount(1);
    expect(server.azure().writes).toEqual([]);
});

test('V4-S07 RM4-07 zero runs preserves physical point Passed Failed and Unspecified outcomes without normalization', async ({ page }) => {
    server.azure().runs.splice(0);
    server.azure().results.find(result=>result.testSuite.id===32&&result.testCase.id===201)!.outcome='Unspecified';
    await page.reload(); await open(page);
    await expect(outcome(page,'TST','Regression',101)).toHaveValue('Passed');
    await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');
    await expect(outcome(page,'TST','Regression',201,'v22')).toHaveValue('Unspecified');
    await expect(cell(page,'TST','Regression',101).locator('.relations-view-outcome-chip')).toHaveText('✓');
    await expect(cell(page,'TST','Regression',201).locator('.relations-view-outcome-chip')).toHaveText('✗');
    await expect(cell(page,'TST','Regression',201,'v22').locator('.relations-view-outcome-chip')).toHaveText('ACT');
    await outcome(page,'TST','Regression',201,'v22').hover();
    await expect(page.getByRole('tooltip')).toContainText('Active');
    expect(server.azure().runs).toEqual([]);
    expect(server.azure().reads.some(url=>new URL(url).pathname.endsWith('/runs'))).toBe(true);
    expect(server.azure().writes).toEqual([]);
});
