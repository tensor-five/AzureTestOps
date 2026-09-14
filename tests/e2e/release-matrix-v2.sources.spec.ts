import { expect, test, type Page } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v2/server.js';
import { matrixConfig } from './release-matrix-v2/azure-fixture.js';
let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await server.reset(); await page.goto(server.origin); });
const nav = (page: Page) => page.getByRole('button', { name: 'Release-Matrix', exact: true });
async function open(page: Page) { await nav(page).click(); await expect(page.getByRole('table', { name: 'Release-Matrix' })).toBeVisible(); }
const rows = (page: Page, name: string, id: number) => page.locator(`[data-matrix-row='${JSON.stringify([name, id])}']`);
const cell = (page: Page, name: string, id: number, column = 'test') => rows(page, name, id).first().locator(`[data-matrix-column="${column}"]`);
const outcome = (page: Page, name: string, id: number, column = 'test') => cell(page, name, id, column).getByRole('combobox');
const settings = (page: Page) => page.getByRole('button', { name: 'Spalten & Gruppierung', exact: true });
const explicitKey = (name: string, column: string) => JSON.stringify([name, column]);

test('V2-S01 RM03 RM05 RM06 RM07 RM20 entire-plan catalog merges repeated names and IDs while preserving different groups', async ({ page }) => {
    await server.seed({ ...matrixConfig, catalogRootId: 1 }); await page.reload(); await open(page);
    await expect(rows(page, 'Regression', 201)).toHaveCount(1); await expect(rows(page, 'Data Import', 201)).toHaveCount(1);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(11);
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'Data Import', 201)).toHaveValue('Passed');
    await expect(outcome(page, 'Regression', 201, 'acceptance')).toHaveValue('NotRun');
    await expect(rows(page, 'Allgemein', 303)).toBeVisible();
    await expect(rows(page, 'Data Import', 999)).toBeVisible();
    const groups = await page.locator('[data-matrix-group]').allTextContents();
    expect(groups).toHaveLength(3); expect(groups[0]).toContain('Allgemein'); expect(groups[1]).toContain('Data Import'); expect(groups[2]).toContain('Regression');
    expect(server.azure().writes).toEqual([]);
});

test('V2-S02 RM03 RM07 RM08 sources are selected outside the catalog and legacy roots do not constrain them', async ({ page }) => {
    await server.seed({ ...matrixConfig, columns: matrixConfig.columns.map(c => ({ ...c, rootSuiteId: 40 })) }); await page.reload(); await open(page);
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'Data Import', 201)).toHaveValue('Passed');
    await expect(rows(page, 'Data Import', 999)).toHaveCount(0);
    await settings(page).click(); await expect(page.getByLabel(/Release-Wurzel/)).toHaveCount(0);
    const mapping = page.getByLabel('Suite für Regression / 2.1.0', { exact: true }).first();
    await expect(mapping).toContainText(/2\.1\.0-Test.*Regression|Regression.*2\.1\.0-Test/);
    await expect(mapping).toContainText('21');
    expect(server.azure().suiteReads).toContain(21); expect(server.azure().suiteReads).toContain(31);
});

test('V2-S03 RM07 matches full concrete Suite-WIT tags with case and surrounding-space normalization', async ({ page }) => {
    server.azure().suiteTags[21] = ['Other', '  2.1.0-tEsT  '];
    server.azure().suiteTags[43] = ['prefix-2.1.0-Test']; server.azure().suiteTags[44] = ['2.1.0-Test-extra'];
    await server.seed({ ...matrixConfig, columns: [{ ...matrixConfig.columns[0], tag: ' 2.1.0-TEST ' }] }); await page.reload(); await open(page);
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    await settings(page).click(); const mapping = page.getByLabel('Suite für Regression / 2.1.0', { exact: true }).first();
    await expect(mapping.locator('option[value="43"]')).toHaveCount(0); await expect(mapping.locator('option[value="44"]')).toHaveCount(0);
    const hydration = await server.azure().client.get('https://dev.azure.com/contract-org/contract-project/_apis/wit/workitems?ids=21,201');
    expect((hydration.json as { value: any[] }).value).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 21, fields: expect.objectContaining({ 'System.WorkItemType': 'Test Suite', 'System.Tags': 'Other;  2.1.0-tEsT  ' }) }),
        expect.objectContaining({ id: 201, fields: expect.objectContaining({ 'System.WorkItemType': 'Test Case' }) }),
    ]));
});

test('V2-S04 RM07 RM09 never derives sources from case tags, query tags or parent tags', async ({ page }) => {
    server.azure().suiteTags[21] = []; server.azure().suiteTags[20] = ['2.1.0-Test'];
    Object.assign(server.azure().suites.find(s => s.id === 21)!, { suiteType: 'DynamicTestSuite', queryString: "[System.Tags] CONTAINS '2.1.0-Test'" });
    await page.reload(); await open(page);
    await expect(outcome(page, 'Regression', 201)).toHaveCount(0);
    const missing = cell(page, 'Regression', 201).getByRole('button'); await expect(missing).toHaveText('?');
    await missing.focus(); await expect(page.getByRole('tooltip')).toContainText(/Suite fehlt.*Suite-Tag/);
    await expect(outcome(page, 'Data Import', 201)).toHaveValue('Passed');
    expect(server.azure().writes).toEqual([]);
});

test('V2-S05 RM07 empty column tags remain unconfigured and do not match untagged catalog suites', async ({ page }) => {
    await server.seed({ ...matrixConfig, columns: [{ ...matrixConfig.columns[0], tag: '  ' }] }); await page.reload(); await open(page);
    await expect(outcome(page, 'Regression', 201)).toHaveCount(0);
    await expect(cell(page, 'Regression', 201).getByRole('button')).toHaveAccessibleName(/Suite-Tag.*auswählen|Suite-Tag.*festlegen|nicht konfiguriert/);
    await settings(page).click(); await page.getByLabel('Suite-Tag 1', { exact: true }).fill('2.1.0-Test');
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
});

test('V2-S06 RM09 Suite-WIT tag read errors never masquerade as missing sources or an empty matrix', async ({ page }) => {
    server.azure().control.failSuiteTags = true; await page.reload(); await nav(page).click();
    await expect(page.getByRole('alert').filter({ hasText: /Matrix|Suite|Laden/ })).toBeVisible();
    await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
    await expect(page.getByText('Keine Testfälle für diese Filter.', { exact: true })).toHaveCount(0);
    expect(server.azure().writes).toEqual([]);
});

test('V2-S07 RM09 RM12 a tag refresh failure reports stale data or removes it and permits no stale write', async ({ page }) => {
    await open(page); await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    server.azure().control.failSuiteTags = true; await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /Matrix|Suite|Laden/ })).toBeVisible();
    const remaining = outcome(page, 'Regression', 201);
    if (await remaining.count()) { await expect(page.getByRole('alert')).toContainText(/veraltet/); await expect(remaining).toBeDisabled(); }
    expect(server.azure().writes).toEqual([]);
    server.azure().control.failSuiteTags = false; await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(outcome(page, 'Regression', 201)).toBeEnabled();
});

test('V2-S08 RM20 only identical names bearing this exact column tag conflict and explicit IDs survive rename', async ({ page }) => {
    server.azure().suiteTags[43] = ['2.1.0-Test'];
    await page.reload(); await open(page);
    await expect(cell(page, 'Regression', 201).getByRole('button', { name: /Suite zuordnen/ })).toBeVisible();
    await expect(outcome(page, 'Data Import', 201)).toHaveValue('Passed'); await expect(outcome(page, 'Regression', 201, 'acceptance')).toHaveValue('NotRun');
    await settings(page).click(); const mapping = page.getByLabel('Suite für Regression / 2.1.0', { exact: true }).first();
    expect(await mapping.locator('option').allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/A.*Regression.*43.*2\.1\.0-Test/), expect.stringMatching(/21.*2\.1\.0-Test/)]));
    await expect(mapping.locator('option[value="44"]')).toHaveCount(0);
    await mapping.selectOption('43'); await expect(outcome(page, 'Regression', 201)).toHaveValue('NotRun');
    await expect.poll(() => server.disk()).toContain('43'); server.azure().suites.find(s => s.id === 43)!.name = 'Umbenannt';
    await page.reload(); await open(page); await expect(outcome(page, 'Regression', 201)).toHaveValue('NotRun');
    await outcome(page, 'Regression', 201).selectOption('Blocked'); await expect(page.getByRole('status').filter({ hasText: 'Durchlauf bestätigt' })).toBeVisible();
    expect(server.azure().writes[0].body.pointIds).toEqual([43201]);
});

test('V2-S09 RM20 invalid v2 explicit IDs are not replaced after tag removal or a move outside the plan', async ({ page }) => {
    for (const reason of ['tag', 'plan', 'column-tag'] as const) {
        await server.reset({ ...matrixConfig, columns: reason === 'column-tag' ? [{...matrixConfig.columns[0], tag:'2.1.0-Abnahme'}] : matrixConfig.columns, mappings: { [explicitKey('Regression', 'test')]: 43 } });
        server.azure().suiteTags[43] = ['2.1.0-Test'];
        if (reason === 'tag') server.azure().suiteTags[43] = ['different']; else if (reason === 'plan') server.azure().foreignSuites.add(43);
        await page.reload(); await open(page);
        await expect(outcome(page, 'Regression', 201)).toHaveCount(0);
        await expect(cell(page, 'Regression', 201).getByRole('button')).toHaveAccessibleName(/ungültig|neu.*auswählen|erneut.*auswählen/);
        await settings(page).click(); const mapping = page.getByLabel('Suite für Regression / 2.1.0', { exact: true }).first();
        await mapping.selectOption(reason === 'column-tag' ? '31' : '21'); await expect(outcome(page, 'Regression', 201)).toHaveValue(reason === 'column-tag' ? 'NotRun' : 'Failed');
        expect(server.azure().writes).toEqual([]);
    }
});

test('V2-S10 RM05 RM06 RM11 RM12 one point shared by two suite tags updates exactly its rendered copies with one run', async ({ page }) => {
    server.azure().suiteTags[21].push('2.1.0-Pilot');
    await server.seed({ ...matrixConfig, grouping: 'tags', columns: [...matrixConfig.columns, { id: 'pilot', name: '2.1.0', environment: 'Pilot', tag: '2.1.0-Pilot', visible: true }] });
    await page.reload(); await open(page); const before = structuredClone(server.azure().results);
    await expect(rows(page, 'Regression', 201)).toHaveCount(2);
    for (const col of ['test','pilot']) await expect(rows(page, 'Regression', 201).locator(`[data-matrix-column="${col}"] select`)).toHaveCount(2);
    await expect(outcome(page, 'Regression', 201, 'pilot')).toHaveValue('Failed');
    server.azure().control.delayWrite = 300; await outcome(page, 'Regression', 201).selectOption('Blocked');
    for (const col of ['test','pilot']) for (const copy of await rows(page, 'Regression', 201).locator(`[data-matrix-column="${col}"] select`).all()) await expect(copy).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'Durchlauf bestätigt' })).toBeVisible();
    for (const col of ['test','pilot']) for (const copy of await rows(page, 'Regression', 201).locator(`[data-matrix-column="${col}"] select`).all()) await expect(copy).toHaveValue('Blocked');
    await expect(outcome(page, 'Regression', 201, 'acceptance')).toHaveValue('NotRun'); await expect(outcome(page, 'Data Import', 201)).toHaveValue('Passed');
    expect(server.azure().writes.filter(w => w.method === 'POST')).toHaveLength(1); expect(server.azure().writes[0].body.pointIds).toEqual([21201]);
    expect(server.azure().results.filter(r => r.testRun.id === 1)).toEqual(before);
});

test('V2-S11 RM15 migrates real v1 lowdb settings without carrying physical mappings or group state into name groups', async ({ page }) => {
    const old = { ...matrixConfig, version: undefined, grouping: 'tags', tags: ['Data Import','Regression'], search: '201', tagFilter: 'Regression', suiteFilter: '21',
        mappings: { '11:test': 43 }, groupOrder: ['11','13','12'], collapsed: ['11','12'],
        columns: [{ ...matrixConfig.columns[0], rootSuiteId: 40, name: 'Bewährtes Release' }, { ...matrixConfig.columns[1], rootSuiteId: 40, visible: false }] };
    await server.seed(old); await server.patch({ setLayouts: { 'matrix-set': { positions: { 'tc:201:21': { x: 12, y: 34 } } } } });
    await page.reload(); await open(page);
    await expect(page.getByText(/Umstieg|Migration|Zuordnungen.*neu/i).first()).toBeVisible();
    await expect(page.getByText(/Gruppen.*(zurückgesetzt|neu initialisiert)|Reihenfolge.*(zurückgesetzt|neu initialisiert)/i).first()).toBeVisible();
    await expect(page.getByLabel('Gruppieren nach', { exact: true })).toHaveValue('tags');
    await expect(page.getByLabel('Gruppierungs-Tags', { exact: true })).toHaveValue('Data Import\nRegression');
    await expect(page.getByLabel('Testfall suchen', { exact: true })).toHaveValue('201'); await expect(page.getByLabel('Tag', { exact: true })).toHaveValue('Regression'); await expect(page.getByLabel('In Testsuite', { exact: true })).toHaveValue('21');
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    await expect(page.getByRole('columnheader', { name: 'Bewährtes Release Test', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '2.1.0 Abnahme', exact: true })).toHaveCount(0);
    await page.getByLabel('Gruppieren nach', { exact: true }).selectOption('suites');
    await expect(page.getByRole('button', { name: 'Gruppe Data Import einklappen', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Gruppe Regression einklappen', exact: true })).toBeVisible();
    expect((await page.locator('[data-matrix-group]').allTextContents())[0]).toContain('Data Import');
    await expect.poll(async () => JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].version).toBe(2);
    const saved = JSON.parse(await server.disk()).users.contract;
    expect(saved.setReleaseMatrices['matrix-set'].mappings).not.toHaveProperty('11:test');
    expect(saved.setLayouts['matrix-set'].positions).toEqual({ 'tc:201:21': { x: 12, y: 34 } });
    await page.evaluate(() => localStorage.clear()); await page.goto('about:blank'); await server.restart(); await page.goto(server.origin); await open(page);
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    await settings(page).click(); await expect(page.getByLabel('Stammsuite', {exact:true})).toHaveValue('10');
    await expect(page.getByLabel('Suite-Tag 1', {exact:true})).toHaveValue('2.1.0-Test');
});

test('V2-S12 RM03 RM20 suite-name equality is exact even when case tags and title are identical', async ({ page }) => {
    server.azure().suites.find(s => s.id === 21)!.name = 'regression';
    await page.reload(); await open(page); await expect(outcome(page, 'Regression', 201)).toHaveCount(0);
    await expect(cell(page, 'Regression', 201).getByRole('button')).toHaveText('?');
    await server.seed({ ...matrixConfig, catalogRootId: 1 }); await page.reload(); await open(page);
    await expect(rows(page, 'regression', 201)).toHaveCount(1); await expect(rows(page, 'Regression', 201)).toHaveCount(1);
    await expect(outcome(page, 'regression', 201)).toHaveValue('Failed');
});

test('V2-S13 RM09 missing or non-Suite metadata is a load failure rather than an untagged Suite', async ({ page }) => {
    for (const variant of ['omit', 'wrong-type'] as const) {
        await server.reset();
        if (variant === 'omit') server.azure().control.omitSuiteMetadata = 21;
        else server.azure().control.wrongSuiteMetadataType = 21;
        await page.reload(); await nav(page).click();
        await expect(page.getByRole('alert').filter({ hasText: /Matrix|Suite|Laden/ })).toBeVisible();
        await expect(page.locator('[data-matrix-row]')).toHaveCount(0); expect(server.azure().writes).toEqual([]);
    }
});

test('V2-S14 RM09 RM12 verified writes followed by a failed Suite-tag refresh cannot unlock old displayed outcomes', async ({ page }) => {
    await open(page); await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    server.azure().control.failTagsAfterComplete = true;
    await outcome(page, 'Regression', 201).selectOption('Passed');
    await expect(page.getByRole('alert').filter({ hasText: /Matrix|Suite|Laden/ })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Durchlauf bestätigt.*100|100.*Durchlauf bestätigt/ })).toBeVisible();
    const displayed = outcome(page, 'Regression', 201);
    if (await displayed.count()) {
        await expect(displayed).toBeDisabled(); await expect(page.getByRole('alert')).toContainText(/veraltet/);
    }
    expect(server.azure().writes.filter(w => w.method === 'POST')).toHaveLength(1);
    expect(server.azure().results.at(-1)).toMatchObject({ outcome: 'Passed', state: 'Completed', testPoint: { id: 21201 } });
    server.azure().control.failSuiteTags = false; server.azure().control.failTagsAfterComplete = false;
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Passed'); await expect(outcome(page, 'Regression', 201)).toBeEnabled();
});

test('V2-S15 RM07 RM15 v1 case-tag columns remain visible but do not manufacture Suite-tag sources during migration', async ({ page }) => {
    const legacy = { ...matrixConfig, version: undefined, columns: [{ ...matrixConfig.columns[0], rootSuiteId: 20 }] };
    server.azure().suiteTags[21] = []; await server.seed(legacy); await page.reload(); await open(page);
    await expect(page.getByRole('columnheader', { name: '2.1.0 Test', exact: true })).toBeVisible();
    await expect(outcome(page, 'Regression', 201)).toHaveCount(0);
    await expect(cell(page, 'Regression', 201).getByRole('button')).toHaveText('?');
    await expect(page.getByText(/Umstieg|Migration|Zuordnungen.*neu/i).first()).toBeVisible();
    await settings(page).click(); await expect(page.getByLabel('Suite-Tag 1', { exact: true })).toHaveValue('2.1.0-Test');
    expect(server.azure().writes).toEqual([]);
});

test('V2-S16 RM03 RM20 duplicate physical Suite records do not create false ambiguity, extra options or duplicate logical rows', async ({ page }) => {
    const repeated = server.azure().suites.find(s => s.id === 21)!;
    server.azure().suites.push(structuredClone(repeated), structuredClone(repeated));
    await server.seed({ ...matrixConfig, catalogRootId: 1 }); await page.reload(); await open(page);
    await expect(rows(page, 'Regression', 201)).toHaveCount(1);
    await expect(outcome(page, 'Regression', 201)).toHaveValue('Failed');
    await expect(cell(page, 'Regression', 201).getByRole('button', { name: /Suite zuordnen/ })).toHaveCount(0);
    await settings(page).click();
    const mapping = page.getByLabel('Suite für Regression / 2.1.0', { exact: true }).first();
    await expect(mapping.locator('option[value="21"]')).toHaveCount(1);
    await expect(mapping.locator('option[value="43"]')).toHaveCount(0);
    expect(server.azure().writes).toEqual([]);
});
