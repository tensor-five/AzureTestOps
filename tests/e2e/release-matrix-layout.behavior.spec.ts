import { expect, test } from '@playwright/test';
import { startMatrixServer } from './release-matrix-v3/server.js';
import { matrixConfig, addVersionColumns } from './release-matrix-v3/azure-fixture.js';
import { nav, open, rows, cell, outcome, settings, confirmed } from './release-matrix-v3/ui.js';

let server: Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async () => { server = await startMatrixServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => { await server.reset(); await page.goto(server.origin); });

test('V4-B01 RM3-05 RM3-10 grouping shows opposite row context in a separate column', async ({ page }) => {
    await open(page);
    const rowKeys = await page.locator('[data-matrix-row]').evaluateAll(elements => elements.map(e => e.getAttribute('data-matrix-row')).sort());
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall', 'Inhalt', '2.1.0', '2.2.0']);
    await expect(rows(page, 'TST', 'Regression', 201).getByRole('cell', { name: 'Regression', exact: true })).toBeVisible();
    await expect(rows(page, 'TST', 'Regression', 201).getByRole('rowheader')).not.toContainText('Regression');
    await expect(page.getByRole('button', { name: 'Gruppe TST einklappen', exact: true })).toBeVisible();
    const mode = page.getByLabel('Gruppieren nach', { exact: true });
    await expect(mode.locator('option')).toHaveText(['Umgebung', 'Inhalt']);
    await mode.selectOption('content');
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall', 'Umgebung', '2.1.0', '2.2.0']);
    for (const environment of ['TST', 'ACC']) {
        const row = rows(page, environment, 'Regression', 201);
        await expect(row.getByRole('cell', { name: environment, exact: true })).toBeVisible();
        await expect(row.getByRole('rowheader')).not.toContainText(environment);
    }
    await expect(page.getByRole('button', { name: 'Gruppe Regression einklappen', exact: true })).toBeVisible();
    expect(await page.locator('[data-matrix-row]').evaluateAll(elements => elements.map(e => e.getAttribute('data-matrix-row')).sort())).toEqual(rowKeys);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'ACC', 'Regression', 101)).toHaveValue('Blocked');
    await expect(page.getByLabel('Gruppierungs-Tags', { exact: true })).toHaveCount(0);
    await mode.selectOption('environment');
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall', 'Inhalt', '2.1.0', '2.2.0']);
    await expect(rows(page, 'TST', 'Regression', 201).getByRole('cell', { name: 'Regression', exact: true })).toBeVisible();
    await expect(rows(page, 'TST', 'Regression', 201).getByRole('rowheader')).not.toContainText('Regression');
    expect(server.azure().writes).toEqual([]);
});

test('V4-B02 RM3-01 RM3-13 version selection, visibility and order persist by ID without editable title fields', async ({ page }) => {
    await open(page); await settings(page).click();
    await expect(page.getByLabel(/Spaltenname|Suite-Tag|Umgebung \d/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Spalte hinzufügen', exact: true }).click();
    await page.getByLabel('Versions-Suite 3', { exact: true }).selectOption('40');
    await page.getByRole('button', { name: 'Spalte 3 nach links', exact: true }).click();
    await page.getByLabel('Spalte 3 anzeigen', { exact: true }).uncheck();
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall','Inhalt','2.1.0','2.0.0']);
    await expect.poll(async () => JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].columns.map((c: any) => [c.versionSuiteId, c.visible])).toEqual([[20,true],[40,true],[30,false]]);
    await page.evaluate(() => localStorage.clear()); await page.goto('about:blank'); await server.restart(); await page.goto(server.origin); await open(page);
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall','Inhalt','2.1.0','2.0.0']);
    await settings(page).click(); await expect(page.getByLabel('Versions-Suite 3', { exact: true })).toHaveValue('30');
    await page.getByLabel('Spalte 3 anzeigen', { exact: true }).check();
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall','Inhalt','2.1.0','2.0.0','2.2.0']);
});

test('V4-B03 RM3-09 a write targets one physical content point and preserves other versions, environments and contents', async ({ page }) => {
    await open(page); const before = structuredClone(server.azure().results);
    await outcome(page, 'TST', 'Regression', 201).selectOption('Blocked'); await confirmed(page);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Blocked');
    await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
    await expect(outcome(page, 'TST', 'Data Import', 201)).toHaveValue('Passed');
    await expect(outcome(page, 'ACC', 'Regression', 201)).toHaveValue('NotRun');
    expect(server.azure().writes.filter(w => w.method === 'POST')).toHaveLength(1);
    expect(server.azure().writes[0].body.pointIds).toEqual([22201]);
    expect(server.azure().runs.at(-1)).toMatchObject({ id: 100, state: 'Completed', isAutomated: false });
    expect(server.azure().results.at(-1)).toMatchObject({ testSuite: { id: 22 }, testCase: { id: 201 }, testPoint: { id: 22201 }, outcome: 'Blocked', state: 'Completed' });
    expect(server.azure().results.filter(r => r.testRun.id === 1)).toEqual(before);
    await outcome(page, 'TST', 'Regression', 201).hover(); await expect(page.getByRole('tooltip')).toContainText('Blocked');
    await expect(page.getByRole('tooltip')).toContainText(/2\.1\.0.*TST.*Regression/);
    await expect(page.getByRole('tooltip')).not.toContainText('Failed');
});

test('V4-B04 RM3-09 completed-run precedence and point fallback still resolve the same concrete point', async ({ page }) => {
    server.azure().runs.push({ id: 2, plan: { id: 1 }, name: 'Später abgeschlossen', state: 'Completed', isAutomated: false });
    server.azure().runs.push({ id: 3, plan: { id: 1 }, name: 'Noch offen', state: 'InProgress', isAutomated: false });
    const original = server.azure().results.find(r => r.testSuite.id === 22 && r.testCase.id === 201)!;
    server.azure().results.push({ ...structuredClone(original), id: 20, testRun: { id: 2 }, outcome: 'Passed', completedDate: '2026-09-02T10:00:00Z' });
    server.azure().results.push({ ...structuredClone(original), id: 30, testRun: { id: 3 }, outcome: 'Failed', state: 'InProgress', completedDate: null });
    await page.reload(); await open(page);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Passed');
    server.azure().results.splice(server.azure().results.findIndex(r => r.testRun.id === 3), 1);
    server.azure().control.omitResultSuite = true;
    await page.getByRole('button', { name: 'Matrix aktualisieren', exact: true }).click();
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Passed');
    await expect(outcome(page, 'TST', 'Data Import', 201)).toHaveValue('Passed');
    expect(server.azure().writes).toEqual([]);
});

test('V4-B05 RM3-09 compact known/custom outcomes and point-count guards remain unchanged', async ({ page }) => {
    await open(page);
    await expect(cell(page, 'TST', 'Regression', 101).locator('.relations-view-outcome-chip')).toHaveText('✓');
    await expect(cell(page, 'TST', 'Regression', 201).locator('.relations-view-outcome-chip')).toHaveText('✗');
    await expect(cell(page, 'TST', 'Regression', 103).locator('.relations-view-outcome-chip')).toHaveText('CUS');
    await outcome(page, 'TST', 'Regression', 103).hover(); await expect(page.getByRole('tooltip')).toContainText('CustomOutcome');
    await expect(outcome(page, 'TST', 'Regression', 302)).toBeDisabled();
    await cell(page, 'TST', 'Regression', 302).locator('.matrix-cell-control').focus(); await expect(page.getByRole('tooltip')).toContainText('2 Testpunkte');
    await expect(outcome(page, 'TST', 'Regression', 304)).toBeDisabled();
    await cell(page, 'TST', 'Regression', 304).locator('.matrix-cell-control').focus(); await expect(page.getByRole('tooltip')).toContainText('0 Testpunkte');
    expect(server.azure().writes).toEqual([]);
});

test('V4-B06 RM3-09 RM3-13 keyboard cancellation, confirmation and all manual outcomes preserve the compact controls', async ({ page }) => {
    await open(page); const control = outcome(page, 'TST', 'Regression', 201);
    await control.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
    await expect(control).toHaveValue('Failed'); expect(server.azure().writes).toEqual([]);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await confirmed(page);
    await expect(control).toHaveValue('Blocked');
    await expect(cell(page, 'TST', 'Regression', 201).locator('.relations-view-outcome-chip')).toHaveText('■');
    let run = 101;
    for (const [value, symbol] of [['Passed','✓'], ['Failed','✗'], ['NotApplicable','N/A'], ['Inconclusive','INC']]) {
        await control.selectOption(value); await confirmed(page, run++);
        await expect(control).toHaveValue(value);
        await expect(cell(page, 'TST', 'Regression', 201).locator('.relations-view-outcome-chip')).toHaveText(symbol);
        await expect(control).toHaveAccessibleName(new RegExp(value));
    }
    const group = page.getByRole('button', { name: 'Gruppe TST einklappen', exact: true });
    await group.focus(); await page.keyboard.press('Enter'); await expect(rows(page, 'TST', 'Regression', 201)).toHaveCount(0);
    await page.keyboard.press('Enter'); await expect(rows(page, 'TST', 'Regression', 201)).toHaveCount(1);
});

test('V4-B07 RM3-09 errors before and after run creation remain visible without a false success', async ({ page }) => {
    await open(page); server.azure().control.failWrite = true;
    await outcome(page, 'TST', 'Regression', 201).selectOption('Passed');
    await expect(page.getByRole('alert')).toBeVisible(); await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    expect(server.azure().writes.filter(w => w.method === 'POST')).toHaveLength(0);
    server.azure().control.failWrite = false; server.azure().control.failAfterCreate = true;
    await outcome(page, 'TST', 'Regression', 201).selectOption('Passed');
    await expect(page.getByRole('alert')).toContainText('100');
    await expect(page.getByRole('status').filter({ hasText: 'Durchlauf bestätigt' })).toHaveCount(0);
    await expect(outcome(page, 'TST', 'Regression', 201)).toBeDisabled();
    await page.getByRole('button', { name: 'Zuordnung', exact: true }).click(); await nav(page).click();
    await expect(page.getByRole('alert')).toContainText('100');
    expect(server.azure().writes.filter(w => w.method === 'POST')).toHaveLength(1);
});

test('V4-B08 RM3-10 exact case-tag, direct-membership and search filters never change column sources', async ({ page }) => {
    await server.seed({...matrixConfig,tagFilter:'rEgReSsIoN',search:'cSv'}); await page.reload();
    await open(page);
    await expect(page.locator('[data-matrix-row]')).toHaveCount(4);
    await page.getByLabel('Testfall suchen', { exact: true }).fill('cSv');
    await page.getByLabel('Tag', { exact: true }).selectOption('Regression');
    await page.getByLabel('In Testsuite', { exact: true }).selectOption('32');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(4);
    await expect(outcome(page, 'TST', 'Regression', 201)).toHaveValue('Failed');
    await expect(outcome(page, 'TST', 'Regression', 201, 'v22')).toHaveValue('Passed');
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Testfall','Inhalt','2.1.0','2.2.0']);
    await page.getByLabel('In Testsuite', { exact: true }).selectOption('30');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(0); // Parent contains no direct members.
    await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click();
    await page.getByLabel('Tag', { exact: true }).focus(); // Load the full tag catalogue through the real user interaction.
    await page.getByLabel('Tag', { exact: true }).selectOption('Regress');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(0); await expect(rows(page, 'TST', 'Regression', 303)).toHaveCount(0);
    await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click();
    await page.getByLabel('Testfall suchen', { exact: true }).fill('101');
    await expect(page.locator('[data-matrix-row]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click();
    await expect(page.locator('[data-matrix-row]')).toHaveCount(13);
    expect(server.azure().writes).toEqual([]);
});

test('V4-B09 RM3-12 real v2 preferences migrate once, retaining filters, set and context while resetting tags', async ({ page }) => {
    const old = { version: 2, planId: 1, catalogRootId: 10, grouping: 'tags', tags: ['Regression','Data Import'],
        columns: [{ id:'test', name:'2.1.0', environment:'TST', tag:'2.1.0-Test', visible:true }],
        mappings: { '["Regression","test"]':22 }, groupOrder:['Regression'], collapsed:['Regression'], collapsedTags:['tag:regression'],
        search:'201', tagFilter:'Regression', suiteFilter:'32' };
    await page.goto('about:blank');
    await server.seed(old); await server.patch({ setLayouts:{'matrix-set':{positions:{'tc:201:22':{x:12,y:34}}}} });
    await page.goto(server.origin); await nav(page).click();
    await expect(page.getByText(/Umstieg|Migration/i)).toHaveCount(0);
    await expect(page.getByText(/Versions.*auswählen|Versions.*wählen/i).first()).toBeVisible();
    await expect(page.locator('[data-matrix-column]')).toHaveCount(0);
    await expect(page.getByLabel('Testfall suchen', { exact:true })).toHaveValue('201');
    await expect(page.getByLabel('Tag', { exact:true })).toHaveValue('Regression');
    await expect(page.getByLabel('In Testsuite', { exact:true })).toHaveValue('32');
    await settings(page).click(); await expect(page.getByLabel('Stammsuite', {exact:true})).toHaveCount(0);
    await expect(page.getByLabel('Gruppierungs-Tags', {exact:true})).toHaveCount(0);
    await expect.poll(async()=>JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].version).toBe(3);
    const migrated = JSON.parse(await server.disk()).users.contract;
    const migratedMatrix = migrated.setReleaseMatrices['matrix-set'];
    expect(migratedMatrix.columns).toEqual([]); expect(migratedMatrix.mappings).toEqual({});
    expect(migratedMatrix.groupOrderByMode).toEqual({environment:[],content:[]});
    expect(migratedMatrix.collapsedByMode).toEqual({environment:[],content:[]});
    expect(migratedMatrix.tags ?? []).toEqual([]); expect(migratedMatrix.collapsedTags ?? []).toEqual([]);
    expect(migrated.adoContext).toEqual({organization:'contract-org',project:'contract-project'});
    expect(migrated.activeSetId).toBe('matrix-set'); expect(migrated.sets).toHaveLength(2);
    expect(migrated.setLayouts['matrix-set'].positions).toEqual({'tc:201:22':{x:12,y:34}});
    await page.getByLabel('Gruppieren nach', {exact:true}).selectOption('content');
    await page.getByRole('button', {name:'Spalte hinzufügen',exact:true}).click();
    await page.getByLabel('Versions-Suite 1', {exact:true}).selectOption('20');
    await expect(outcome(page,'TST','Regression',201,await page.locator('[data-matrix-column]').first().getAttribute('data-matrix-column') ?? '')).toHaveValue('Failed');
    await expect.poll(async()=>JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].columns[0]?.versionSuiteId).toBe(20);
    const configured = JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'];
    for(let restart=0;restart<2;restart++) {
        await page.evaluate(()=>localStorage.clear()); await page.goto('about:blank'); await server.restart(); await page.goto(server.origin); await open(page);
        await expect(page.getByLabel('Gruppieren nach', {exact:true})).toHaveValue('content');
        await expect(page.getByRole('columnheader',{name:'2.1.0',exact:true})).toBeVisible();
        expect(JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set']).toEqual(configured);
    }
});

test('V4-B10 RM3-13 LowDB keeps each grouping order/collapse, filters and version state independently per set', async ({ page }) => {
    await server.seed({...matrixConfig,groupOrderByMode:{environment:['ACC','PRD','TST'],content:['Data Import','Regression']}}); await page.reload();
    await open(page);
    await page.getByRole('button',{name:'Gruppe TST nach oben',exact:true}).click();
    await page.getByRole('button',{name:'Gruppe TST nach oben',exact:true}).click();
    await page.getByRole('button',{name:'Gruppe ACC einklappen',exact:true}).click();
    await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('content');
    await page.getByRole('button',{name:'Gruppe Regression nach oben',exact:true}).click();
    await page.getByRole('button',{name:'Gruppe Data Import einklappen',exact:true}).click();
    await page.getByLabel('Testfall suchen',{exact:true}).fill('201');
    await expect.poll(async()=>JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].search).toBe('201');
    await page.evaluate(()=>localStorage.clear()); await page.goto('about:blank'); await server.restart(); await page.goto(server.origin); await open(page);
    await expect(page.getByLabel('Gruppieren nach',{exact:true})).toHaveValue('content');
    await expect(page.locator('[data-matrix-group]').first()).toContainText('Regression');
    await expect(page.getByRole('button',{name:'Gruppe Data Import aufklappen',exact:true})).toBeVisible();
    await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('environment');
    await expect(page.locator('[data-matrix-group]').first()).toContainText('TST');
    await expect(page.getByRole('button',{name:'Gruppe ACC aufklappen',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Matrix Set',exact:true}).click(); await page.getByRole('option',{name:'Other Set',exact:true}).click();
    await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('');
    await expect(page.getByText(/Versions.*auswählen|Versions.*wählen/i).first()).toBeVisible();
    await page.getByRole('button',{name:'Other Set',exact:true}).click(); await page.getByRole('option',{name:'Matrix Set',exact:true}).click();
    await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('201');
    await expect(page.getByRole('columnheader',{name:'2.1.0',exact:true})).toBeVisible();
    expect(JSON.stringify(JSON.parse(await server.disk()).users.contract.setReleaseMatrices)).not.toMatch(/lastOutcome|pending|results|runId/);
});

test('V4-B11 RM3-13 equal environment and content names do not share collapse state', async ({ page }) => {
    for (const suite of server.azure().suites) if(suite.name === 'Regression') suite.name = 'TST';
    await page.reload(); await open(page);
    await page.getByRole('button',{name:'Gruppe TST einklappen',exact:true}).click();
    await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('content');
    await expect(rows(page,'TST','TST',201)).toBeVisible();
    await page.getByRole('button',{name:'Gruppe TST einklappen',exact:true}).click();
    await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('environment');
    await page.getByRole('button',{name:'Gruppe TST aufklappen',exact:true}).click();
    await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('content');
    await expect(rows(page,'TST','TST',201)).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Gruppe TST aufklappen',exact:true})).toBeVisible();
});

test('V4-B12 RM3-09 RM3-13 touch update followed by missing-membership tooltip stays within the viewport', async ({ browser }) => {
    const context=await browser.newContext({viewport:{width:390,height:600},isMobile:true,hasTouch:true}); const page=await context.newPage();
    try {
        await page.goto(server.origin); await open(page); const target=outcome(page,'TST','Regression',201);
        expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await target.tap(); await target.selectOption('Passed'); await confirmed(page);
        await cell(page,'TST','Data Import',203,'v22').getByRole('button').tap();
        await expect(page.getByRole('tooltip')).toContainText('Nicht in dieser Suite');
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    } finally { await context.close(); }
});

test('V4-B13 RM3-13 real horizontal and vertical scrolling preserve header, row context and tooltip bounds', async ({ page }) => {
    const columns=addVersionColumns(server.azure(),14);
    for(let id=400;id<460;id++){server.azure().membership[600].push(id);server.azure().titles[id]=`Zusatztest ${id}`;}
    await server.seed({...matrixConfig,columns}); await page.reload(); await open(page);
    const scroll=page.locator('[data-matrix-scroll]'); await scroll.scrollIntoViewIfNeeded();
    const first=rows(page,'TST','Regression',101).getByRole('rowheader'); const before=(await first.boundingBox())!.x;
    await scroll.evaluate(el=>{el.scrollLeft=300;}); expect(await scroll.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    expect(Math.abs((await first.boundingBox())!.x-before)).toBeLessThan(2);
    expect(await scroll.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    await scroll.evaluate(el=>{el.scrollTop=300;el.scrollLeft=0;}); expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    const head=page.getByRole('columnheader',{name:'Testfall',exact:true}); const bounds=(await scroll.boundingBox())!;
    expect((await head.boundingBox())!.y).toBeGreaterThanOrEqual(bounds.y); expect((await head.boundingBox())!.y).toBeLessThan(bounds.y+4);
    await scroll.evaluate(el=>{el.scrollTop=0;el.scrollLeft=el.scrollWidth;});
    await outcome(page,'TST','Regression',201,'version-13').hover(); await expect(page.getByRole('tooltip')).toBeVisible();
    const tip=(await page.getByRole('tooltip').boundingBox())!; expect(tip.x).toBeGreaterThanOrEqual(0); expect(tip.x+tip.width).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));
});

test('V4-B14 RM3-13 browser fallback survives unavailable preferences while a recovered LowDB remains authoritative', async ({ page }) => {
    await open(page);
    await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('content');
    await page.getByLabel('Testfall suchen',{exact:true}).fill('201');
    await expect.poll(async()=>JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'].search).toBe('201');
    await page.route('**/phase2/user-preferences', async route => {
        if(route.request().method()==='GET') await route.fulfill({status:503,body:'Preferences unavailable'});
        else await route.continue();
    });
    await page.reload(); await open(page);
    await expect(page.getByLabel('Gruppieren nach',{exact:true})).toHaveValue('content');
    await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('201');
    await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');
    await page.unroute('**/phase2/user-preferences');
    await server.seed({...matrixConfig,search:'103'}); await page.reload(); await open(page);
    await expect(page.getByLabel('Gruppieren nach',{exact:true})).toHaveValue('environment');
    await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('103');
    await expect(rows(page,'TST','Regression',103)).toHaveCount(1);
});
