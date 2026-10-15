import {expect,test} from '@playwright/test';
import {startMatrixServer} from './release-matrix-v3/server.js';
import {open,outcome,rows,settings} from './release-matrix-v3/ui.js';
let server:Awaited<ReturnType<typeof startMatrixServer>>;
test.beforeAll(async()=>{server=await startMatrixServer();});
test.afterAll(async()=>{await server?.close();});
test.beforeEach(async({page})=>{await server.reset();await page.goto(server.origin);});
test('returning to the matrix reuses its recent read and explicit refresh gets current Azure data',async({page})=>{
 let reads=0;page.on('request',r=>{
  const url=new URL(r.url());
  // Cache-only previews are Azure-free; count only complete matrix reads.
  if(r.method()==='GET'&&/\/release-matrix$/.test(url.pathname)&&url.searchParams.get('cache')!=='only')reads++;
 });
 await open(page);await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');
 await page.getByRole('button',{name:'Zuordnung',exact:true}).click();await open(page);
 await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');expect(reads).toBe(1);
 const changed=server.azure().results.find(r=>r.testSuite.id===22&&r.testCase.id===201)!;
 changed.outcome='Blocked';
 // A changed run marker makes the external update immediately visible through incremental history loading.
 const changedRun=server.azure().runs.find(run=>run.id===changed.testRun.id)!;
 changedRun.revision=(changedRun.revision??0)+1;
 await page.getByRole('button',{name:'Refresh release matrix',exact:true}).click();
 await expect(outcome(page,'TST','Regression',201)).toHaveValue('Blocked');expect(reads).toBe(2);
});
test('an external suite filter reads only membership and leaves version outcomes intact',async({page})=>{
 await open(page);await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');
 server.azure().reads.splice(0);
 await page.getByLabel('In Testsuite',{exact:true}).selectOption('52');
 await expect(rows(page,'TST','Regression',201)).toHaveCount(1);await expect(page.locator('[data-matrix-row]')).toHaveCount(4);
 expect(server.azure().reads).toHaveLength(1);expect(new URL(server.azure().reads[0]).pathname).toMatch(/suites\/52\/testcases$/);
 await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');expect(server.azure().writes).toHaveLength(0);
});
test('changing versions reads their contents and avoids unrelated suites',async({page})=>{
 await open(page);await expect(outcome(page,'TST','Regression',201)).toHaveValue('Failed');
 server.azure().reads.splice(0);await settings(page).click();await page.getByLabel('Versions-Suite 1',{exact:true}).selectOption('50');
 await expect(outcome(page,'TST','Regression',201)).toHaveValue('NotRun');
 const suites=server.azure().reads.flatMap(url=>{const m=new URL(url).pathname.match(/suites\/(\d+)\/(testcases|points)$/);return m?[Number(m[1])]:[];});
 expect(suites).toContain(52);expect(suites).toContain(32);expect(suites).not.toContain(22);expect(suites).not.toContain(42);
});
