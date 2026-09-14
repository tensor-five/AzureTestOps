// Test-only Azure boundary: production adapters, aggregation, HTTP routes and UI remain real.
import type { AzureHttpResponse } from '../../../src/shared/azure-devops/azure-rest-client.js';

export const matrixConfig = {
  version: 2, planId: 1, catalogRootId: 10, grouping: 'suites', tags: ['Regression', 'Data Import'],
  columns: [
    { id: 'test', name: '2.1.0', environment: 'Test', tag: '2.1.0-Test', visible: true },
    { id: 'acceptance', name: '2.1.0', environment: 'Abnahme', tag: '2.1.0-Abnahme', visible: true }
  ], mappings: {}, groupOrder: [], collapsed: [], search: '', tagFilter: '', suiteFilter: ''
};
export function makeAzureFixture() {
  const suites = [
    [1, 'Plan', null], [10, 'Katalog', 1], [11, 'Regression', 10], [12, 'Data Import', 10], [13, 'Allgemein', 10],
    [20, '2.1.0-Test', 1], [21, 'Regression', 20], [22, 'Data Import', 20], [23, 'Allgemein', 20],
    [30, '2.1.0-Abnahme', 1], [31, 'Regression', 30], [32, 'Data Import', 30],
    [40, 'Mehrdeutig', 1], [41, 'A', 40], [42, 'B', 40], [43, 'Regression', 41], [44, 'Regression', 42]
  ].map(([id, name, parent]) => ({ id: Number(id), name: String(name), parentSuite: parent ? { id: Number(parent) } : undefined, suiteType: 'StaticTestSuite', queryString: Number(id)===21?"[System.Tags] CONTAINS '2.1.0-Abnahme'":undefined }));
  const membership: Record<number, number[]> = {11:[101,201,103,101],12:[201,202,203],13:[301,302,303,304],21:[101,201,103],22:[201,202,999],23:[301,302,304],31:[101,201],32:[201,203],43:[201],44:[201]};
  const titles: Record<number,string> = {101:'Anmelden',103:'Zweiter Faktor',201:'CSV importieren',202:'Fehlerhafte Zeilen',203:'Neues Format',301:'Datenexport',302:'Mehrere Konfigurationen',303:'Noch für kein Release',304:'Ohne Testpunkt',999:'Nicht im Katalog'};
  const tags: Record<number,string[]> = {101:['Regression'],103:['Regression'],201:['Regression','Data Import','2.1.0-Test'],202:['Data Import'],203:['Data Import'],301:[],302:[],303:['Regress'],304:[],999:['Data Import']};
  // Suite Work Item tags are independent from test-case tags and parent/query tags.
  const suiteTags: Record<number, string[]> = { 1:['2.1.0-Test'], 10:['2.1.0-Abnahme'],
    20:['misleading-parent'], 21:['2.1.0-Test'], 22:['2.1.0-Test'], 23:['2.1.0-Test'],
    30:['2.1.0-Test'], 31:['2.1.0-Abnahme'], 32:['2.1.0-Abnahme'], 43:['2.2.0-Test'], 44:['2.2.0-Test'] };
  const suiteReads: number[] = [];
  const reads: string[] = [];
  const foreignSuites = new Set<number>();
  let nextRun = 100;
  const runs: any[] = [{id:1,plan:{id:1},name:'Bestehender Lauf',state:'Completed',isAutomated:false}];
  const results: any[] = [
    result(1,1,21,101,'Passed'), result(2,1,21,201,'Failed'), result(3,1,22,201,'Passed'),
    result(4,1,23,301,'CustomOutcome'), result(5,1,31,101,'Blocked')
  ];
  const writes: {method:string;url:string;body:any}[]=[];
  const control = { failRead:false, failWrite:false, failAfterCreate:false, delayWrite:0, failAfterComplete:false, hideNewResults:false, omitResultSuite:false, failSuite:0, failSuiteTags:false, omitSuiteMetadata:0, wrongSuiteMetadataType:0, failTagsAfterComplete:false };
  function result(id:number, run:number, suite:number, workItem:number, outcome:string) {return {id,testRun:{id:run},testSuite:{id:suite},testCase:{id:workItem},testPoint:{id:suite*1000+workItem},outcome,state:'Completed',completedDate:'2026-09-01T10:00:00Z'};}
  const response=(json:any,status=200):AzureHttpResponse=>({status,json});
  const list=(value:any[])=>response({value,count:value.length});
  function tree(id:number):any {const node=suites.find(s=>s.id===id)!;return {...node,children:suites.filter(s=>!foreignSuites.has(s.id)&&s.parentSuite?.id===id).map(s=>tree(s.id))};}
  function point(suite:number,id:number, extra=false) {const last=results.filter(r=>r.testSuite.id===suite&&r.testCase.id===id&&(!control.hideNewResults||r.testRun.id===1)).at(-1);return {id:suite*1000+id+(extra?100000:0),testCase:{id},configuration:{id:extra?2:1,name:extra?'Firefox':'Default'},outcome:last?.outcome??'NotRun',lastTestRun:last?.testRun??{},lastResult:last?{id:last.id}:{}};}
  function workItems(ids:number[]):AzureHttpResponse {
    const requestedSuites=ids.filter(id=>suites.some(s=>s.id===id));suiteReads.push(...requestedSuites);
    if(control.failSuiteTags&&requestedSuites.length)return response({},400);
    return list(ids.filter(id=>id!==control.omitSuiteMetadata).map(id=>{const suite=suites.find(s=>s.id===id);return {id,fields:{'System.WorkItemType':suite&&id!==control.wrongSuiteMetadataType?'Test Suite':'Test Case','System.Title':suite?.name??titles[id]??String(id),'System.State':'Ready','System.Tags':(suite?suiteTags[id]??[]:tags[id]??[]).join(';')},relations:[]};}));
  }
  const client = {
    async get(raw:string):Promise<AzureHttpResponse>{
      reads.push(raw);const url=new URL(raw);const path=url.pathname.toLowerCase();
      if(control.failRead) return response({},400);
      if(path.endsWith('/suites')) return list(url.searchParams.has('$asTreeView')?[tree(1)]:suites.filter(s=>!foreignSuites.has(s.id)));
      const caseMatch=path.match(/suites\/(\d+)\/testcases\/(\d+)$/);
      if(caseMatch){const suite=Number(caseMatch[1]),id=Number(caseMatch[2]);if(control.failSuite===suite)return response({},400);return (membership[suite]??[]).includes(id)?response({testCase:{id}}):response({},404);}
      const singleRun=path.match(/runs\/(\d+)$/);
      if(singleRun){const run=runs.find(r=>r.id===Number(singleRun[1])&&(!control.hideNewResults||r.id===1));return run?response(run):response({},404);}
      const singleResult=path.match(/runs\/(\d+)\/results\/(\d+)$/);
      if(singleResult){const result=results.find(r=>r.testRun.id===Number(singleResult[1])&&r.id===Number(singleResult[2])&&(!control.hideNewResults||r.testRun.id===1));return result?response(control.omitResultSuite?{...result,testSuite:null}:result):response({},404);}
      const suiteMatch=path.match(/suites\/(\d+)\/(testcases|points)$/);
      if(suiteMatch){const id=Number(suiteMatch[1]);if(control.failSuite===id)return response({},400);const ids=[...new Set(membership[id]??[])].filter(wi=>!url.searchParams.has('testCaseId')||wi===Number(url.searchParams.get('testCaseId')));return list(suiteMatch[2]==='testcases'?(membership[id]??[]).map(id=>({testCase:{id}})):ids.flatMap(wi=>wi===304?[]:wi===302?[point(id,wi),point(id,wi,true)]:[point(id,wi)]));}
      if(path.endsWith('/plans'))return list([{id:1,name:'Plan'}]);
      if(path.endsWith('/runs'))return list(control.hideNewResults?runs.filter(r=>r.id===1):runs);
      const runMatch=path.match(/runs\/(\d+)\/results$/);if(runMatch)return list(results.filter(r=>r.testRun.id===Number(runMatch[1])).map(r=>control.omitResultSuite?{...r,testSuite:null}:r));
      if(path.includes('/wit/wiql/'))return response({workItems:[]});
      if(path.endsWith('/wit/workitems'))return workItems((url.searchParams.get('ids')??'').split(',').map(Number));
      const workItem=path.match(/\/wit\/workitems\/(\d+)$/);if(workItem){const loaded=workItems([Number(workItem[1])]);return loaded.status===200?response((loaded.json as {value:unknown[]}).value[0]):loaded;}
      throw new Error('Unexpected test Azure GET '+url.pathname);
    },
    async post(url:string,body:any):Promise<AzureHttpResponse>{
      if(new URL(url).pathname.toLowerCase().endsWith('/wit/workitemsbatch'))return workItems(body.ids??[]);
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
      Object.assign(runs.find(r=>r.id===run),body);if(control.failAfterComplete&&body.state==='Completed')control.failRead=true;if(control.failTagsAfterComplete&&body.state==='Completed')control.failSuiteTags=true;return response(runs.find(r=>r.id===run));
    }
  };
  return {client,writes,results,runs,control,suites,membership,titles,tags,suiteTags,suiteReads,reads,foreignSuites};
}
