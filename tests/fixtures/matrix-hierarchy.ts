import type { MatrixSnapshot } from '../../src/application/dto/release-matrix.dto.js';
import type { TestCaseProjection } from '../../src/domain/test-management/test-case-projection.js';
import { emptyMatrixConfig } from '../../src/domain/release-matrix/matrix-config.js';
export const matrixSuite = (id:number,name:string,parentSuiteId:number|null)=>({id,name,parentSuiteId,path:name,depth:0,suiteType:'StaticTestSuite'});
export const matrixProjection = (suiteId:number,workItemId:number,title='CSV',tags:string[]=['Regression','Import']):TestCaseProjection=>({suiteId,workItemId,title,tags,suitePath:'Catalog',state:'Ready',workItemType:'Test Case',assignedTo:null,areaPath:null,priority:null,relatedIds:[],testPointId:null,configurationId:null,configurationName:null,lastOutcome:'NotRun',lastRunId:null,lastResultId:null,lastResultCompletedDate:null});
export function matrixHierarchyFixture() {
    const snapshot:MatrixSnapshot={contextIdentity:'test-context',planId:1,suites:[
        matrixSuite(1,'Plan',null),matrixSuite(10,'Catalog',1),matrixSuite(20,'Version',10),matrixSuite(21,'TST',20),matrixSuite(22,'Regression',21),matrixSuite(23,'Import',21),matrixSuite(24,'ACC',20),matrixSuite(25,'Regression',24),
        matrixSuite(40,'Earlier',10),matrixSuite(41,'TST',40),matrixSuite(42,'Regression',41),
        matrixSuite(30,'Outside',1),matrixSuite(31,'TST',30),matrixSuite(32,'Regression',31)
    ],projections:[matrixProjection(22,100),matrixProjection(23,100),matrixProjection(23,200,'Empty',[]),matrixProjection(25,100),matrixProjection(42,100),matrixProjection(32,100)],pointCounts:{}};
    const column={id:'release',versionSuiteId:30,visible:true};
    const config={...emptyMatrixConfig(1,10),columns:[column]};
    return {snapshot,column,config};
}
