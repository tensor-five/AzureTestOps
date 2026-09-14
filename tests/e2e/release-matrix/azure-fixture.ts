// Test-only Azure boundary: production adapters, aggregation, HTTP routes and UI remain real.
import type { AzureHttpResponse } from '../../../src/shared/azure-devops/azure-rest-client.js';

export const matrixConfig = {
  planId: 1, catalogRootId: 10, grouping: 'suites', tags: ['Regression', 'Data Import'],
  columns: [
    { id: 'test', name: '2.1.0', environment: 'Test', tag: '2.1.0-Test', rootSuiteId: 20, visible: true },
    { id: 'acceptance', name: '2.1.0', environment: 'Abnahme', tag: '2.1.0-Abnahme', rootSuiteId: 30, visible: true }
  ], mappings: {}, groupOrder: [], collapsed: [], search: '', tagFilter: '', suiteFilter: ''
};
export function makeAzureFixture() {
  const suites = [
    [1, 'Plan', null], [10, 'Katalog', 1], [11, 'Regression', 10], [12, 'Data Import', 10], [13, 'Allgemein', 10],
    [20, '2.1.0-Test', 1], [21, 'Regression', 20], [22, 'Data Import', 20], [23, 'Allgemein', 20],
    [30, '2.1.0-Abnahme', 1], [31, 'Regression', 30], [32, 'Data Import', 30],
    [40, 'Mehrdeutig', 1], [41, 'A', 40], [42, 'B', 40], [43, 'Regression', 41], [44, 'Regression', 42]
  ].map(([id, name, parent]) => ({ id: Number(id), name: String(name), parentSuite: parent ? { id: Number(parent) } : undefined, suiteType: 'StaticTestSuite' }));
  const membership: Record<number, number[]> = {11:[101,201,103,101],12:[201,202,203],13:[301,302,303,304],21:[101,201,103],22:[201,202,999],23:[301,302,304],31:[101,201],32:[201,203],43:[201],44:[201]};
  const titles: Record<number,string> = {101:'Anmelden',103:'Zweiter Faktor',201:'CSV importieren',202:'Fehlerhafte Zeilen',203:'Neues Format',301:'Datenexport',302:'Mehrere Konfigurationen',303:'Noch für kein Release',304:'Ohne Testpunkt',999:'Nicht im Katalog'};
  const tags: Record<number,string[]> = {101:['Regression'],103:['Regression'],201:['Regression','Data Import','2.1.0-Test'],202:['Data Import'],203:['Data Import'],301:[],302:[],303:['Regress'],304:[],999:['Data Import']};
  let nextRun = 100;
  const runs: any[] = [{id:1,plan:{id:1},name:'Bestehender Lauf',state:'Completed',isAutomated:false}];
  const results: any[] = [
    result(1,1,21,101,'Passed'), result(2,1,21,201,'Failed'), result(3,1,22,201,'Passed'),
    result(4,1,23,301,'CustomOutcome'), result(5,1,31,101,'Blocked')
  ];
  const writes: {method:string;url:string;body:any}[]=[];
  const control = { failRead:false, failWrite:false, failAfterCreate:false, delayWrite:0, failAfterComplete:false, hideNewResults:false, omitResultSuite:false, failSuite:0 };
  function result(id:number, run:number, suite:number, workItem:number, outcome:string) {return {id,testRun:{id:run},testSuite:{id:suite},testCase:{id:workItem},testPoint:{id:suite*1000+workItem},outcome,state:'Completed',completedDate:'2026-09-01T10:00:00Z'};}
  const response=(json:any,status=200):AzureHttpResponse=>({status,json});
  const list=(value:any[])=>response({value,count:value.length});
  function tree(id:number):any {const node=suites.find(s=>s.id===id)!;return {...node,children:suites.filter(s=>s.parentSuite?.id===id).map(s=>tree(s.id))};}
  function point(suite:number,id:number, extra=false) {const last=results.filter(r=>r.testSuite.id===suite&&r.testCase.id===id&&(!control.hideNewResults||r.testRun.id===1)).at(-1);return {id:suite*1000+id+(extra?100000:0),testCase:{id},configuration:{id:extra?2:1,name:extra?'Firefox':'Default'},outcome:last?.outcome??'NotRun',lastTestRun:last?.testRun??{},lastResult:last?{id:last.id}:{}};}
  const client = {
    async get(raw:string):Promise<AzureHttpResponse>{
      const url=new URL(raw);const path=url.pathname.toLowerCase();
      if(control.failRead) return response({},400);
      if(path.endsWith('/suites')) return list(url.searchParams.has('$asTreeView')?[tree(1)]:suites);
      const suiteMatch=path.match(/suites\/(\d+)\/(testcases|points)$/);
      if(suiteMatch){const id=Number(suiteMatch[1]);if(control.failSuite===id)return response({},400);const ids=[...new Set(membership[id]??[])];return list(suiteMatch[2]==='testcases'?(membership[id]??[]).map(id=>({testCase:{id}})):ids.flatMap(wi=>wi===304?[]:wi===302?[point(id,wi),point(id,wi,true)]:[point(id,wi)]));}
      if(path.endsWith('/plans'))return list([{id:1,name:'Plan'}]);
      if(path.endsWith('/runs'))return list(control.hideNewResults?runs.filter(r=>r.id===1):runs);
      const runMatch=path.match(/runs\/(\d+)\/results$/);if(runMatch)return list(results.filter(r=>r.testRun.id===Number(runMatch[1])).map(r=>control.omitResultSuite?{...r,testSuite:null}:r));
      if(path.includes('/wit/wiql/'))return response({workItems:[]});
      if(path.endsWith('/wit/workitems'))return list((url.searchParams.get('ids')??'').split(',').map(Number).map(id=>({id,fields:{'System.WorkItemType':'Test Case','System.Title':titles[id]??String(id),'System.State':'Ready','System.Tags':(tags[id]??[]).join(';')},relations:[]})));
      throw new Error('Unexpected test Azure GET '+url.pathname);
    },
    async post(url:string,body:any):Promise<AzureHttpResponse>{
      if(control.delayWrite)await new Promise(resolve=>setTimeout(resolve,control.delayWrite));
      if(control.failWrite)return response({},400);
      if(!/\/runs\?/.test(url))throw new Error('Unexpected test Azure POST');
      writes.push({method:'POST',url,body:structuredClone(body)});
      if(body.plan?.id!==1&&body.plan?.id!=='1')throw new Error('Run needs intended plan');if(body.automated!==false&&body.isAutomated!==false)throw new Error('Manual run required');if(body.pointIds?.length!==1)throw new Error('Exactly one point required');
      const id=nextRun++;runs.push({id,plan:body.plan,name:body.name,state:body.state??'InProgress',isAutomated:body.automated??body.isAutomated});
      for(const pointId of body.pointIds??[]){const suite=Math.floor(pointId/1000),wi=pointId%1000;results.push({...result(id*10,id,suite,wi,'Unspecified'),completedDate:null,state:'InProgress'});}
      return response(runs.at(-1),200);
    },
    async patch(url:string,body:any):Promise<AzureHttpResponse>{
      if(control.failAfterCreate)return response({},400);
      writes.push({method:'PATCH',url,body:structuredClone(body)});
      const match=new URL(url).pathname.match(/runs\/(\d+)(\/results)?$/i);if(!match)throw new Error('Unexpected test Azure PATCH');
      const run=Number(match[1]);
      if(match[2]){for(const item of body){const target=results.find(r=>r.testRun.id===run&&r.id===item.id);if(!target)throw new Error('Missing result');Object.assign(target,item);}return list(results.filter(r=>r.testRun.id===run));}
      Object.assign(runs.find(r=>r.id===run),body);if(control.failAfterComplete&&body.state==='Completed')control.failRead=true;return response(runs.find(r=>r.id===run));
    }
  };
  return {client,writes,results,runs,control,suites,membership,titles};
}
