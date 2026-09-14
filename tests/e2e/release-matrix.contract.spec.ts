import { expect, test, type Page } from '@playwright/test';
import { startMatrixServer } from './release-matrix/server.js';
import { matrixConfig } from './release-matrix/azure-fixture.js';
let server:Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async()=>{server=await startMatrixServer();});
test.afterAll(async()=>{await server?.close();});
test.beforeEach(async({page})=>{await server.reset();await page.goto(server.origin);});
const nav=(page:Page)=>page.getByRole('button',{name:'Release-Matrix',exact:true});
async function open(page:Page){await expect(nav(page)).toBeVisible();await nav(page).click();await expect(page.getByRole('table',{name:'Release-Matrix'})).toBeVisible();}
const row=(page:Page,suite:number,id:number)=>page.locator(`[data-matrix-row="${suite}:${id}"]`).first();
const cell=(page:Page,suite:number,id:number,col='test')=>row(page,suite,id).locator(`[data-matrix-column="${col}"]`);
const outcome=(page:Page,suite:number,id:number,col='test')=>cell(page,suite,id,col).getByRole('combobox');

test('RM01 RM02 RM03 RM05 RM08 RM17 preserves suite occurrences and existing navigation',async({page})=>{
  await expect(page.locator('.relations-view-card-test-case').first()).toBeVisible();const before=await page.locator('.relations-view-card-test-case').count();await open(page);
  await expect(row(page,11,201)).toBeVisible();await expect(row(page,12,201)).toBeVisible();await expect(row(page,12,203)).toBeVisible();
  await expect(page.locator('[data-matrix-row$=":999"]')).toHaveCount(0);
  await expect(outcome(page,11,201)).toHaveValue('Failed');await expect(outcome(page,12,201)).toHaveValue('Passed');
  await expect(nav(page)).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Zuordnung',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Zuordnung',exact:true}).click();await expect(page.locator('.relations-view-card-test-case')).toHaveCount(before);
  expect(server.azure().writes).toEqual([]);
});
test('RM04 RM06 RM15 retains the editable ordered tag list and distinct sources',async({page})=>{
  await open(page);await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('tags');
  await page.getByLabel('Gruppierungs-Tags',{exact:true}).fill('data import\nRegression\nDATA IMPORT\n');await page.getByRole('button',{name:'Tag-Liste anwenden'}).click();
  await expect(page.locator('[data-matrix-group]').first()).toContainText('data import');
  await expect(page.locator('[data-matrix-group]')).toHaveCount(3);
  await expect(page.locator('[data-matrix-row="11:201"]')).toHaveCount(2);await expect(page.locator('[data-matrix-row="12:201"]')).toHaveCount(2);
  await expect.poll(()=>server.disk()).toContain('data import');
  await page.evaluate(()=>localStorage.clear());await page.reload();await open(page);
  await expect(page.getByLabel('Gruppieren nach',{exact:true})).toHaveValue('tags');
  await page.getByLabel('Gruppierungs-Tags',{exact:true}).fill('');await page.getByRole('button',{name:'Tag-Liste anwenden'}).click();await expect(page.locator('[data-matrix-group]')).toHaveCount(1);
});
test('RM09 RM10 RM13 distinguishes absence, NotRun, unknown outcomes and ambiguous write targets',async({page})=>{
  await open(page);
  await expect(cell(page,12,203).getByRole('combobox')).toHaveCount(0);await expect(cell(page,12,203)).toHaveText('·');
  await expect(outcome(page,12,203,'acceptance')).toHaveValue('NotRun');
  await expect(cell(page,13,301,'acceptance')).toHaveText('?');
  await expect(cell(page,13,301)).toContainText('CUS');
  await expect(outcome(page,13,302)).toBeDisabled();
});
test('RM10 RM16 copies existing chips and exposes full outcome on hover and focus',async({page})=>{
  const base=page.locator('[data-item-key="tc:201:21"] .relations-view-outcome-chip');
  await expect(base).toBeVisible();const style=async(element:any)=>element.evaluate((el:HTMLElement)=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color,s.borderColor,s.height,s.fontSize,s.borderRadius];});const reference:Record<string,unknown>={};
  for(const theme of ['light','dark']){await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);reference[theme]=await style(base);}
  await open(page);const chip=cell(page,11,201).locator('.relations-view-outcome-chip');await expect(chip).toHaveText('✗');
  for(const theme of ['light','dark']){await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);expect(await style(chip)).toEqual(reference[theme]);}
  await outcome(page,11,201).hover();await expect(page.getByRole('tooltip')).toContainText('Failed');await page.mouse.move(0,0);await outcome(page,11,201).focus();await expect(page.getByRole('tooltip')).toContainText('Failed');
  expect((await cell(page,11,201).boundingBox())!.width).toBeLessThanOrEqual(90);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('RM11 RM12 RM14 writes a new isolated completed run, preserves history and confirms readback',async({page})=>{
  await open(page);const history=structuredClone(server.azure().results);server.azure().control.delayWrite=300;
  await outcome(page,11,201).selectOption('Passed');await expect(outcome(page,11,201)).toBeDisabled();
  await expect(page.getByRole('status').filter({hasText:'Durchlauf bestätigt'})).toBeVisible();
  expect(server.azure().writes.filter(w=>w.method==='POST')).toHaveLength(1);
  expect(server.azure().writes[0].body.pointIds).toEqual([21201]);
  expect(server.azure().results.filter(r=>r.testRun.id===1)).toEqual(history);
  expect(server.azure().runs.at(-1).state).toBe('Completed');expect(server.azure().results.at(-1).outcome).toBe('Passed');
  expect(server.azure().results.at(-1)).toMatchObject({state:'Completed',testSuite:{id:21},testCase:{id:201},testPoint:{id:21201},testRun:{id:100}});expect(Date.parse(server.azure().results.at(-1).completedDate)).toBeGreaterThan(Date.parse(history[0].completedDate));
  await expect(outcome(page,12,201)).toHaveValue('Passed');
  await outcome(page,12,203,'acceptance').selectOption('Blocked');await expect(page.getByRole('status').filter({hasText:/Durchlauf bestätigt.*101|101.*Durchlauf bestätigt/})).toBeVisible();
  expect(server.azure().runs).toHaveLength(3);
  await page.getByRole('button',{name:'Zuordnung',exact:true}).click();await page.getByRole('button',{name:'Refresh active set',exact:true}).click();await expect(page.locator('[data-item-key="tc:201:21"] .relations-view-outcome-chip')).toHaveAccessibleName('Outcome: Passed');
});
test('RM11 RM14 offers completed outcomes without a destructive reset and keeps tag copies coherent',async({page})=>{
  await open(page);const options=await outcome(page,11,201).locator('option:not([disabled])').allTextContents();expect(options).toEqual(['Passed','Failed','Blocked','NotApplicable','Inconclusive']);
  await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('tags');await outcome(page,11,201).selectOption('Blocked');
  await expect(page.getByRole('status').filter({hasText:'Durchlauf bestätigt'})).toBeVisible();
  for(const element of await page.locator('[data-matrix-row="11:201"] [data-matrix-column="test"] select').all())await expect(element).toHaveValue('Blocked');
  for(const element of await page.locator('[data-matrix-row="12:201"] [data-matrix-column="test"] select').all())await expect(element).toHaveValue('Passed');
});
test('RM12 RM14 separates write failure and a created run with unconfirmed result',async({page})=>{
  await open(page);server.azure().control.failWrite=true;await outcome(page,11,201).selectOption('Passed');await expect(page.getByRole('alert').filter({hasText:/Durchlauf|Speichern/})).toBeVisible();await expect(outcome(page,11,201)).toHaveValue('Failed');expect(server.azure().runs).toHaveLength(1);
  server.azure().control.failWrite=false;server.azure().control.failAfterCreate=true;await outcome(page,11,201).selectOption('Passed');await expect(page.getByRole('alert').filter({hasText:/100.*nicht bestätigt|nicht bestätigt.*100/})).toBeVisible();expect(server.azure().runs).toHaveLength(2);
});
test('RM18 RM19 combines actual suite membership, exact tags and title search without changing columns',async({page})=>{
  await open(page);await page.getByLabel('In Testsuite',{exact:true}).selectOption('22');await page.getByLabel('Tag',{exact:true}).selectOption('Regression');
  await expect(page.locator('[data-matrix-row]')).toHaveCount(2);await expect(row(page,11,201)).toBeVisible();await expect(row(page,12,201)).toBeVisible();
  await page.getByLabel('Testfall suchen',{exact:true}).fill('nicht vorhanden');await expect(page.getByText('Keine Testfälle für diese Filter.',{exact:true})).toBeVisible();
  await page.getByLabel('Testfall suchen',{exact:true}).fill('CSV');await expect(page.locator('[data-matrix-row]')).toHaveCount(2);
  await expect(page.getByRole('columnheader',{name:'2.1.0 Test',exact:true})).toBeVisible();
});
test('RM06 RM07 RM15 persists catalog, release columns, mappings, group order and collapse per set',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Spalten & Gruppierung',exact:true}).click();
  await page.getByRole('button',{name:'Spalte hinzufügen',exact:true}).click();
  await page.getByLabel('Spaltenname 3',{exact:true}).fill('Vergleich');await page.getByLabel('Versions-Tag 3',{exact:true}).fill('2.2.0-Test');await page.getByLabel('Release-Wurzel 3',{exact:true}).selectOption('40');
  await page.getByRole('button',{name:'Spalte 3 nach links',exact:true}).click();
  await page.getByRole('button',{name:'Gruppe Data Import nach oben',exact:true}).click();await page.getByRole('button',{name:'Gruppe Data Import einklappen',exact:true}).click();
  await expect.poll(()=>server.disk()).toContain('2.2.0-Test');await page.evaluate(()=>localStorage.clear());await page.goto('about:blank');await server.restart();await page.goto(server.origin);await open(page);
  await expect(page.getByRole('columnheader',{name:'Vergleich',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Gruppe Data Import aufklappen',exact:true})).toBeVisible();
  expect(await page.getByRole('table',{name:'Release-Matrix'}).getByRole('columnheader').allTextContents()).toEqual(['Testfall','2.1.0Test','Vergleich','2.1.0Abnahme']);await expect(page.locator('[data-matrix-group]').first()).toContainText('Data Import');
  const stored=JSON.parse(await server.disk()).users.contract.setReleaseMatrices['matrix-set'];expect(stored.tags).toEqual(['Regression','Data Import']);expect(stored.columns.map((c:any)=>c.tag)).toEqual(['2.1.0-Test','2.2.0-Test','2.1.0-Abnahme']);expect(stored.collapsed.length).toBeGreaterThan(0);
});
test('RM20 requires explicit selection for duplicate names and preserves IDs through rename',async({page})=>{
  await server.seed({...matrixConfig,columns:[{...matrixConfig.columns[0],rootSuiteId:40}]});await page.reload();await open(page);await expect(cell(page,11,201).getByRole('button',{name:/Suite zuordnen/})).toBeVisible();await expect(outcome(page,11,201)).toHaveCount(0);
  await page.getByRole('button',{name:'Spalten & Gruppierung',exact:true}).click();await page.getByLabel('Suite für Regression / 2.1.0',{exact:true}).selectOption('43');
  await expect(outcome(page,11,201)).toHaveValue('NotRun');await expect.poll(()=>server.disk()).toContain('43');server.azure().suites.find(s=>s.id===43)!.name='Umbenannt';await page.reload();await open(page);await expect(outcome(page,11,201)).toHaveValue('NotRun');
  server.azure().suites.find(s=>s.id===43)!.parentSuite={id:20};await page.reload();await open(page);await expect(outcome(page,11,201)).toHaveCount(0);await expect(cell(page,11,201)).toContainText('?');
});
test('RM09 RM16 handles failed loads and empty configuration without fabricated statuses',async({page})=>{
  await server.seed({...matrixConfig,columns:[]});await page.reload();await nav(page).click();await expect(page.getByText(/Versionsspalten auswählen/)).toBeVisible();
  await server.seed(matrixConfig);server.azure().control.failRead=true;await page.reload();await nav(page).click();await expect(page.getByRole('alert').filter({hasText:/Matrix|Laden/})).toBeVisible();await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
});

test('RM03 RM06 RM08 reads the full catalog once per occurrence and retains existing point fallback',async({page})=>{
  server.azure().control.omitResultSuite=true;server.azure().titles[101]='Gleicher Titel';server.azure().titles[103]='Gleicher Titel';await page.reload();await open(page);
  await expect(page.locator('[data-matrix-row="11:101"]')).toHaveCount(1);await expect(row(page,13,303)).toBeVisible();await expect(outcome(page,11,201)).toHaveValue('Failed');
  expect(await page.locator('[data-matrix-row^="11:"]').evaluateAll(rows=>rows.map(r=>r.getAttribute('data-matrix-row')))).toEqual(['11:201','11:101','11:103']);
  await page.getByRole('button',{name:'Zuordnung',exact:true}).click();await expect(page.locator('[data-item-key="tc:201:21"] .relations-view-outcome-chip')).toHaveAccessibleName('Outcome: Failed');
});
test('RM04 RM06 tag presentation preserves all suite paths and has no effect on suite mode',async({page})=>{
  await open(page);const suiteGroups=await page.locator('[data-matrix-group]').allTextContents();await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('tags');
  await page.getByLabel('Gruppierungs-Tags',{exact:true}).fill('Data Import\nUnbenutzter Tag\nRegression');await page.getByRole('button',{name:'Tag-Liste anwenden'}).click();
  expect(await page.locator('[data-matrix-group]').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('Data Import'),expect.stringContaining('Regression'),expect.stringContaining('Ohne Gruppierungs-Tag')]));await expect(page.locator('[data-matrix-group]').filter({hasText:'Unbenutzter Tag'})).toHaveCount(0);
  await expect(row(page,11,201)).toContainText('Regression');await expect(row(page,12,201)).toContainText('Data Import');
  await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('suites');expect(await page.locator('[data-matrix-group]').allTextContents()).toEqual(suiteGroups);
});
test('RM09 RM10 RM13 explains noneditable targets and absent cells on hover, focus and tap',async({page})=>{
  await open(page);for(const [suite,id,label] of [[13,304,'Testpunkt'],[13,302,'Testpunkt']] as const){await expect(outcome(page,suite,id)).toBeDisabled();await cell(page,suite,id).hover();await expect(page.getByRole('tooltip')).toContainText(label);}
  const missing=cell(page,12,203).getByRole('button');await missing.hover();await expect(page.getByRole('tooltip')).toContainText('Nicht in dieser Suite');await missing.focus();await expect(page.getByRole('tooltip')).toContainText('Nicht in dieser Suite');
  const suiteMissing=cell(page,13,301,'acceptance').getByRole('button');await suiteMissing.focus();await expect(page.getByRole('tooltip')).toContainText('Suite fehlt');
  await cell(page,13,301).hover();await expect(page.getByRole('tooltip')).toContainText('CustomOutcome');await expect(outcome(page,13,301)).toHaveAccessibleName(/CustomOutcome/);
});
test('RM12 RM14 rejects failed confirmation and stale history without silently creating another run',async({page})=>{
  await open(page);server.azure().control.failAfterComplete=true;await outcome(page,11,201).selectOption('Passed');await expect(page.getByRole('alert').filter({hasText:/nicht bestätigt/})).toBeVisible();expect(server.azure().runs.at(-1).state).toBe('Completed');expect(server.azure().writes.filter(w=>w.method==='POST')).toHaveLength(1);
  await server.reset();await page.reload();await open(page);server.azure().results.find(r=>r.testSuite.id===21&&r.testCase.id===201)!.outcome='Passed';server.azure().control.hideNewResults=true;await outcome(page,11,201).selectOption('Passed');await expect(page.getByRole('alert').filter({hasText:/nicht bestätigt/})).toBeVisible();expect(server.azure().writes.filter(w=>w.method==='POST')).toHaveLength(1);
});
test('RM01 RM12 RM14 locks identical copies and isolates a pending write across a set switch',async({page})=>{
  await open(page);await page.getByLabel('Gruppieren nach',{exact:true}).selectOption('tags');server.azure().control.delayWrite=700;await outcome(page,11,201).selectOption('Passed');
  for(const copy of await page.locator('[data-matrix-row="11:201"] [data-matrix-column="test"] select').all())await expect(copy).toBeDisabled();
  await page.getByRole('button',{name:'Matrix Set',exact:true}).click();await page.getByRole('option',{name:'Other Set',exact:true}).click();await expect(page.getByText(/Versionsspalten auswählen/)).toBeVisible();
  await expect.poll(()=>{const run=server.azure().runs.at(-1);return {id:run.id,state:run.state};}).toEqual({id:100,state:'Completed'});expect(server.azure().writes.filter(w=>w.method==='POST')).toHaveLength(1);expect(server.azure().writes[0].body.pointIds).toEqual([21201]);
  await expect(page.getByRole('status').filter({hasText:'Durchlauf bestätigt'})).toHaveCount(0);
});
test('RM01 RM02 RM07 RM15 restores every matrix preference after runtime restart without altering other sets',async({page})=>{
  const preserved={setLayouts:{'matrix-set':{hideEmptySuites:true,positions:{'tc:101:21':{x:14,y:28}}}},setFilters:{'matrix-set':{testCases:{titleQuery:'Anmelden'}}}};
  await server.patch(preserved);await open(page);await page.getByLabel('Tag',{exact:true}).selectOption('Regression');await page.getByLabel('Testfall suchen',{exact:true}).fill('201');await page.getByLabel('In Testsuite',{exact:true}).selectOption('21');
  await page.getByRole('button',{name:'Spalten & Gruppierung',exact:true}).click();await page.getByLabel('Stammsuite',{exact:true}).selectOption('11');await page.getByLabel('Spaltenname 1',{exact:true}).fill('Release A');await page.getByLabel('Umgebung 1',{exact:true}).fill('Testsystem');await page.getByLabel('Spalte 2 anzeigen',{exact:true}).uncheck();
  await expect.poll(()=>server.disk()).toContain('Testsystem');await page.evaluate(()=>localStorage.clear());await page.goto('about:blank');await server.restart();await page.goto(server.origin);await open(page);
  await expect(page.getByLabel('Tag',{exact:true})).toHaveValue('Regression');await expect(page.getByLabel('In Testsuite',{exact:true})).toHaveValue('21');await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('201');
  await expect(page.getByRole('columnheader',{name:'Release A Testsystem',exact:true})).toBeVisible();await expect(page.getByRole('columnheader',{name:'2.1.0 Abnahme',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Spalten & Gruppierung',exact:true}).click();await expect(page.getByLabel('Stammsuite',{exact:true})).toHaveValue('11');
  const disk=JSON.parse(await server.disk()).users.contract;expect(disk.setLayouts).toEqual(preserved.setLayouts);expect(disk.setFilters).toEqual(preserved.setFilters);expect(disk.sets).toHaveLength(2);expect(disk.adoContext).toEqual({organization:'contract-org',project:'contract-project'});expect(JSON.stringify(disk.setReleaseMatrices)).not.toMatch(/lastOutcome|pending|results|runId/);
  await page.getByRole('button',{name:'Matrix Set',exact:true}).click();await page.getByRole('option',{name:'Other Set',exact:true}).click();await expect(page.getByLabel('Testfall suchen',{exact:true})).toHaveValue('');await expect(page.getByText(/Versionsspalten auswählen/)).toBeVisible();
});
test('RM18 RM19 combines exact case-insensitive filters, excludes descendants and clears back to catalog',async({page})=>{
  await server.seed({...matrixConfig,tagFilter:'regression',search:'cSv'});await page.reload();await open(page);await expect(page.locator('[data-matrix-row]')).toHaveCount(2);
  await server.seed({...matrixConfig,tagFilter:'Regress'});await page.reload();await open(page);await expect(page.locator('[data-matrix-row]')).toHaveCount(1);await expect(row(page,13,303)).toBeVisible();
  await page.getByLabel('Tag',{exact:true}).selectOption('');await page.getByLabel('In Testsuite',{exact:true}).selectOption('20');await expect(page.locator('[data-matrix-row]')).toHaveCount(0);
  await page.getByLabel('In Testsuite',{exact:true}).selectOption('');await expect(row(page,13,303)).toBeVisible();await expect(page.locator('[data-matrix-group]')).toHaveCount(3);
  await page.getByLabel('In Testsuite',{exact:true}).selectOption('44');await expect.poll(()=>server.disk()).toContain('44');server.azure().control.failSuite=44;await page.reload();await nav(page).click();await expect(page.getByRole('alert').filter({hasText:/Matrix|Laden/})).toBeVisible();await expect(page.getByText('Keine Testfälle für diese Filter.',{exact:true})).toHaveCount(0);
});
test('RM20 exposes candidate paths, avoids fuzzy matching and detects removed explicit suites',async({page})=>{
  await server.seed({...matrixConfig,columns:[{...matrixConfig.columns[0],rootSuiteId:40}]});await page.reload();await open(page);await page.getByRole('button',{name:'Spalten & Gruppierung',exact:true}).click();const mapping=page.getByLabel('Suite für Regression / 2.1.0',{exact:true});expect(await mapping.locator('option').allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/A.*Regression.*43/),expect.stringMatching(/B.*Regression.*44/)]));await mapping.selectOption('43');await expect(mapping).toHaveValue('43');
  await expect.poll(()=>server.disk()).toContain('43');await page.evaluate(()=>localStorage.clear());await page.goto('about:blank');await server.restart();await page.goto(server.origin);await open(page);await page.getByRole('button',{name:'Spalten & Gruppierung',exact:true}).click();await expect(page.getByLabel('Suite für Regression / 2.1.0',{exact:true})).toHaveValue('43');server.azure().suites.splice(server.azure().suites.findIndex(s=>s.id===43),1);await page.reload();await open(page);await expect(outcome(page,11,201)).toHaveCount(0);
  await server.reset();server.azure().suites.find(s=>s.id===21)!.name='Regression erweitert';await page.reload();await open(page);await expect(outcome(page,11,201)).toHaveCount(0);
});
test('RM10 RM11 RM16 uses keyboard selection and exposes every compact status',async({page})=>{
  await open(page);await outcome(page,11,201).focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.getByRole('status').filter({hasText:'Durchlauf bestätigt'})).toBeVisible();await expect(outcome(page,11,201)).toHaveValue('Blocked');await expect(cell(page,11,201).locator('.relations-view-outcome-chip')).toHaveText('■');
  await outcome(page,11,201).selectOption('NotApplicable');await expect(page.getByRole('status').filter({hasText:/Durchlauf bestätigt.*101|101.*Durchlauf bestätigt/})).toBeVisible();await expect(cell(page,11,201).locator('.relations-view-outcome-chip')).toHaveText('N/A');await expect(outcome(page,11,201)).toHaveAccessibleName(/NotApplicable/);
  await expect(cell(page,11,101).locator('.relations-view-outcome-chip')).toHaveText('✓');await expect(cell(page,12,203,'acceptance').locator('.relations-view-outcome-chip')).toHaveText('—');
  expect(await outcome(page,11,201).evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
  const group=page.getByRole('button',{name:'Gruppe Regression einklappen',exact:true});await group.focus();await page.keyboard.press('Enter');await expect(row(page,11,201)).not.toBeVisible();await page.keyboard.press('Enter');await expect(row(page,11,201)).toBeVisible();
});
test('RM09 RM16 touch targets and sticky matrix fit narrow and long screens',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:600},isMobile:true,hasTouch:true});const page=await context.newPage();
  try {await page.goto(server.origin);await open(page);const target=outcome(page,11,201);expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);await target.tap();await target.selectOption('Passed');await expect(page.getByRole('status').filter({hasText:'Durchlauf bestätigt'})).toBeVisible();await cell(page,12,203).getByRole('button').tap();await expect(page.getByRole('tooltip')).toContainText('Nicht in dieser Suite');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}finally{await context.close();}
});
test('RM16 pins row and column context while scrolling many releases and rows, and handles empty catalogs',async({page})=>{
  await server.seed({...matrixConfig,columns:Array.from({length:14},(_,i)=>({...matrixConfig.columns[0],id:'c'+i,name:'Release '+i,environment:'Lange Umgebung für Umbruch'}))});
  for(let id=400;id<440;id++){server.azure().membership[11].push(id);server.azure().titles[id]='Zusatztest '+id;}
  await page.reload();await open(page);const scroll=page.locator('[data-matrix-scroll]');const first=row(page,11,101).getByRole('rowheader');const head=page.getByRole('columnheader',{name:/Release 0/});
  const firstX=(await first.boundingBox())!.x;await scroll.evaluate(el=>el.scrollLeft=300);expect(Math.abs((await first.boundingBox())!.x-firstX)).toBeLessThan(2);await scroll.evaluate(el=>{el.scrollTop=300;el.scrollLeft=0;});const headBox=(await head.boundingBox())!;const scrollBox=(await scroll.boundingBox())!;expect(headBox.y).toBeGreaterThanOrEqual(scrollBox.y);expect(headBox.y).toBeLessThan(scrollBox.y+10);
  const environment=head.getByText('Lange Umgebung für Umbruch',{exact:true});expect((await environment.boundingBox())!.height).toBeGreaterThan(20);expect((await environment.boundingBox())!.y).toBeGreaterThan(headBox.y);
  await scroll.evaluate(el=>{el.scrollTop=0;el.scrollLeft=el.scrollWidth;});const lastCell=row(page,11,201).locator('[data-matrix-column="c13"]');const before=(await lastCell.boundingBox())!.width;await lastCell.getByRole('combobox').hover();const tip=page.getByRole('tooltip');await expect(tip).toBeVisible();const box=(await tip.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));expect((await lastCell.boundingBox())!.width).toBe(before);
  await server.seed({...matrixConfig,catalogRootId:44});server.azure().membership[44]=[];await page.reload();await nav(page).click();await expect(page.getByText(/Testkatalog ist leer/)).toBeVisible();
});
