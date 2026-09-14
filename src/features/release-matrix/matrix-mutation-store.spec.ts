import { describe, expect, it, vi } from 'vitest';
import type { MatrixSnapshot, MatrixWrite, MatrixWriteResult, MatrixResultEvidence } from '../../application/dto/release-matrix.dto.js';
import { loadReleaseMatrix } from '../../application/use-cases/load-release-matrix.use-case.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { getMatrixMutationRevision, getMatrixMutationStore } from './matrix-mutation-store.js';
import { ApiError } from '../../application/dto/api-error.js';

const contextIdentity = 'https://dev.azure.com/contract-org/contract-project';
const input: MatrixWrite = { contextIdentity, planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'Passed' };
const evidence: MatrixResultEvidence = {resultId:1000,runId:100,suiteId:21,workItemId:201,pointId:21201,outcome:'Passed',completedDate:'2026-09-02T10:00:00Z'};

async function fixture() {
    const { services, azure } = matrixTestServices();
    const snapshot: MatrixSnapshot = { ...await loadReleaseMatrix(1, services), contextIdentity };
    const result = { runId: 100, projection: {
        ...snapshot.projections.find(p => p.suiteId === 21 && p.workItemId === 201)!, lastOutcome: 'Passed', lastRunId: 100,
    } };
    const port = { load: vi.fn(async () => snapshot), record: vi.fn(async (): Promise<MatrixWriteResult> => result) };
    return { snapshot, result, port, services, azure, store: getMatrixMutationStore(port, 'catalog', 1, contextIdentity) };
}

describe('Matrix mutation lifetime and scope', () => {
    it.each([
        {rawPoint:99999,omitSuite:false,completedDate:'2026-09-02T10:00:00Z',confirmed:false},
        {rawPoint:21201,omitSuite:true,completedDate:'2026-09-02T10:00:00Z',confirmed:true},
        {rawPoint:99999,omitSuite:true,completedDate:'2026-09-02T10:00:00Z',confirmed:false},
        {rawPoint:21201,omitSuite:true,completedDate:null,confirmed:false},
    ])('requires exact completed raw result evidence despite aggregate point identity ($rawPoint / suite missing $omitSuite / completed $completedDate)',async({rawPoint,omitSuite,completedDate,confirmed})=>{
        const {port,store,services,azure}=await fixture();
        port.record.mockRejectedValue(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Unconfirmed',{runId:100}));await store.record(input);
        azure.runs.push({id:100,plan:{id:1},name:'Created run',state:'Completed',isAutomated:false});
        const previous=azure.results.find(r=>r.testSuite.id===21&&r.testCase.id===201)!;
        azure.results.push({...previous,id:1000,testRun:{id:100},testPoint:{id:rawPoint},outcome:'Passed',completedDate});
        azure.control.omitResultSuite=omitSuite;
        const snapshot={...await loadReleaseMatrix(1,services),contextIdentity};
        expect(snapshot.projections.find(p=>p.suiteId===21&&p.workItemId===201)).toMatchObject({
            lastRunId:100,testPointId:21201,lastOutcome:'Passed',lastResultCompletedDate:omitSuite?null:completedDate,
        });
        expect(snapshot.resultEvidence?.find(r=>r.resultId===1000)).toMatchObject({pointId:rawPoint,suiteId:omitSuite?null:21,completedDate});
        store.reconcile(snapshot,getMatrixMutationRevision());
        expect(store.getSnapshot().blocked.has('21:201')).toBe(!confirmed);
        expect(port.record).toHaveBeenCalledTimes(1);expect(azure.writes).toEqual([]);
        expect(azure.reads.filter(url=>new URL(url).pathname.toLowerCase().endsWith('/runs/100/results'))).toHaveLength(1);
    });

    it.each([
        ['Completed','Passed',true],
        ['InProgress','Passed',false],
        ['Completed','Unspecified',false],
        ['Completed','Failed',false],
    ] as const)('reconciles the actual point fallback only with the completed requested outcome (%s / %s)',async(state,outcome,confirmed)=>{
        const {port,store,services,azure}=await fixture();
        port.record.mockRejectedValue(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Unconfirmed',{runId:100}));
        await store.record(input);
        azure.runs.push({id:100,plan:{id:1},name:'Created run',state,isAutomated:false});
        const previous=azure.results.find(r=>r.testSuite.id===21&&r.testCase.id===201)!;
        azure.results.push({...previous,id:1000,testRun:{id:100},outcome});
        azure.control.omitResultSuite=true;
        const snapshot={...await loadReleaseMatrix(1,services),contextIdentity};
        expect(snapshot.projections.find(p=>p.suiteId===21&&p.workItemId===201)).toMatchObject({
            lastRunId:100,testPointId:21201,lastOutcome:outcome,lastResultCompletedDate:null,
        });
        store.reconcile(snapshot,getMatrixMutationRevision());
        expect(store.getSnapshot().blocked.has('21:201')).toBe(!confirmed);
        expect(store.getSnapshot().status).toBe(confirmed?'Durchlauf bestätigt: 100':'');
        expect(port.record).toHaveBeenCalledTimes(1);expect(azure.writes).toEqual([]);
    });

    it('reconciles only the failed physical point after a later accepted snapshot confirms its structured run ID',async()=>{
        const {port,store,snapshot,result}=await fixture();
        const beforeFailure=getMatrixMutationRevision();
        port.record.mockRejectedValueOnce(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','No run ID in this message',{runId:100}));
        port.record.mockRejectedValueOnce(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Another failure',{runId:101}));
        await store.record(input);await store.record({...input,suiteId:22,pointId:22201});
        const read={...snapshot,completedRunIds:[100],resultEvidence:[evidence],projections:[result.projection]};
        store.reconcile(read,beforeFailure);
        expect(store.getSnapshot().blocked.size).toBe(2);
        const revision=getMatrixMutationRevision();
        store.reconcile(read,revision);
        expect(store.getSnapshot().blocked).toEqual(new Set(['22:201']));
        expect(store.getSnapshot().error).toBe('Another failure');
        expect(store.getSnapshot().status).toBe('Durchlauf bestätigt: 100');
        expect(port.record).toHaveBeenCalledTimes(2); // No reconciliation write/retry.
        expect(store.getSnapshot().confirmationRevision).toBe(0); // This read needs no extra refresh.
    });

    it.each(['other-run','other-case','other-suite','other-point','other-plan','other-context','run-in-progress','missing-run-state','unspecified-outcome','different-outcome'] as const)('retains the lock for an unconfirmed or unrelated snapshot (%s)',async variant=>{
        const {port,store,snapshot,result}=await fixture();
        port.record.mockRejectedValue(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Failure',{runId:100}));await store.record(input);
        const read:MatrixSnapshot={...snapshot,completedRunIds:[100],resultEvidence:[evidence],projections:[{...result.projection}]},projection=read.projections[0];
        if(variant==='other-run')projection.lastRunId=101;
        if(variant==='other-case')projection.workItemId=101;
        if(variant==='other-suite')projection.suiteId=22;
        if(variant==='other-point')projection.testPointId=999;
        if(variant==='other-plan')read.planId=2;
        if(variant==='other-context')read.contextIdentity='other-context';
        if(variant==='run-in-progress')read.completedRunIds=[1];
        if(variant==='missing-run-state')delete read.completedRunIds;
        if(variant==='unspecified-outcome')projection.lastOutcome='Unspecified';
        if(variant==='different-outcome')projection.lastOutcome='Failed';
        store.reconcile(read,getMatrixMutationRevision());
        expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
        await store.record(input);expect(port.record).toHaveBeenCalledTimes(1);
    });

    it.each(['missing','other-suite','other-case','other-run','other-outcome','other-point','missing-date','invalid-date'] as const)('retains a lock without matching raw result evidence (%s)',async variant=>{
        const {port,store,snapshot,result}=await fixture();
        port.record.mockRejectedValue(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Failure',{runId:100}));await store.record(input);
        const proof={...evidence};
        if(variant==='other-suite')proof.suiteId=22;
        if(variant==='other-case')proof.workItemId=101;
        if(variant==='other-run')proof.runId=101;
        if(variant==='other-outcome')proof.outcome='Unspecified';
        if(variant==='other-point')proof.pointId=99999;
        if(variant==='missing-date')proof.completedDate=null;
        if(variant==='invalid-date')proof.completedDate='invalid';
        store.reconcile({...snapshot,completedRunIds:[100],resultEvidence:variant==='missing'?undefined:[proof],projections:[result.projection]},getMatrixMutationRevision());
        expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
        await store.record(input);expect(port.record).toHaveBeenCalledTimes(1);
    });

    it.each([undefined,'100',0])('never reconstructs an invalid structured run ID from message text (%s)',async runId=>{
        const {port,store,snapshot,result}=await fixture();
        port.record.mockRejectedValue(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Durchlauf 100 wurde angelegt.',{runId}));await store.record(input);
        store.reconcile({...snapshot,completedRunIds:[100],resultEvidence:[evidence],projections:[result.projection]},getMatrixMutationRevision());
        expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
    });
    it('retains the pending lock without listeners and prevents another invocation after returning to the same set', async () => {
        const { port, store, result } = await fixture();
        let finish!: (value: MatrixWriteResult) => void;
        port.record.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const started = store.record(input);
        expect(store.getSnapshot().pending.has('21:201')).toBe(true);
        const remounted = getMatrixMutationStore(port, 'catalog', 1, contextIdentity);
        expect(remounted).toBe(store);
        await remounted.record(input);
        expect(port.record).toHaveBeenCalledTimes(1);
        finish(result);
        await started;
        expect(remounted.getSnapshot().pending.size).toBe(0);
        expect(remounted.getSnapshot().status).toContain('100');
    });

    it('retains a failed created run and isolates its message from other sets, plans, contexts and clients', async () => {
        const { port, store } = await fixture();
        port.record.mockRejectedValue(new ApiError(500,'MATRIX_RUN_UNCONFIRMED','Durchlauf 100 wurde angelegt, Ergebnis nicht bestätigt.'));
        await store.record(input);
        expect(store.getSnapshot().error).toContain('100');
        expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
        expect(store.getSnapshot().pending.size).toBe(0);
        await getMatrixMutationStore(port,'catalog',1,contextIdentity).record(input);
        expect(port.record).toHaveBeenCalledTimes(1);
        expect(getMatrixMutationStore(port, 'other', 1, contextIdentity).getSnapshot().error).toBe('');
        expect(getMatrixMutationStore(port, 'other', 1, contextIdentity).getSnapshot().blocked.size).toBe(0);
        expect(getMatrixMutationStore(port, 'catalog', 2, contextIdentity).getSnapshot().error).toBe('');
        expect(getMatrixMutationStore(port, 'catalog', 1, 'other-project').getSnapshot().error).toBe('');
        expect(getMatrixMutationStore({ ...port }, 'catalog', 1, contextIdentity).getSnapshot().error).toBe('');
        expect(getMatrixMutationStore(port, 'catalog', 1, contextIdentity).getSnapshot().error).toContain('nicht bestätigt');
    });

    it('allows an explicit retry when a failed request created no run',async()=>{
        const {port,store}=await fixture();port.record.mockRejectedValueOnce(new ApiError(500,'MATRIX_WRITE_NOT_ATTEMPTED','Kein Run angelegt.'));
        await store.record(input);expect(store.getSnapshot().blocked.size).toBe(0);
        await store.record(input);expect(port.record).toHaveBeenCalledTimes(2);expect(store.getSnapshot().status).toContain('100');
    });

    it('records a completion revision without keeping an outcome cache that could override newer reads', async () => {
        const { store } = await fixture();
        const before = getMatrixMutationRevision();
        await store.record(input);
        expect(store.getSnapshot().confirmationRevision).toBeGreaterThan(before);
        expect(store.getSnapshot().confirmationRevision).toBe(getMatrixMutationRevision());
        expect(store.getSnapshot()).not.toHaveProperty('projections');
    });

    it('does not erase a failed run when a different cell is recorded', async () => {
        const { port, store } = await fixture();
        port.record.mockRejectedValueOnce(new Error('Durchlauf 100 ist nicht bestätigt.'));
        await store.record(input);
        await store.record({ ...input, suiteId: 22, pointId: 22201 });
        expect(store.getSnapshot().error).toContain('100 ist nicht bestätigt');
    });
});

describe('Targeted confirmed updates', () => {
    it('patches only exact physical identities after the read started and preserves metadata', async () => {
        const {store, snapshot, result} = await fixture();
        const started = getMatrixMutationRevision();
        await store.record(input);
        const patched = store.applyConfirmations(snapshot, started);
        for (let index = 0; index < snapshot.projections.length; index++) {
            const original = snapshot.projections[index], updated = patched.projections[index];
            if (original.suiteId === input.suiteId && original.workItemId === input.workItemId) {
                expect(updated).toEqual({...original, lastOutcome: result.projection.lastOutcome,
                    lastRunId: result.projection.lastRunId, lastResultId: result.projection.lastResultId,
                    lastResultCompletedDate: result.projection.lastResultCompletedDate});
                expect(updated.tags).toBe(original.tags);
            } else expect(updated).toBe(original);
        }
        expect(store.applyConfirmations(snapshot, getMatrixMutationRevision())).toBe(snapshot);
        const other = {...snapshot, contextIdentity: 'other'};
        expect(store.applyConfirmations(other, started)).toBe(other);
        const differentPoint = {...snapshot, projections: [{...result.projection, testPointId: 999, lastOutcome: 'Failed'}]};
        expect(store.applyConfirmations(differentPoint, started).projections[0]).toBe(differentPoint.projections[0]);
    });
    it('keeps concurrent confirmations for different physical points without any reload', async () => {
        const {port, store, snapshot, result} = await fixture();
        const started = getMatrixMutationRevision();
        let finish!: (result: MatrixWriteResult) => void;
        port.record.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const first = store.record(input);
        const other = {runId: 101, projection: {...result.projection, suiteId: 22, testPointId: 22201, lastRunId: 101}};
        port.record.mockResolvedValueOnce(other);
        await store.record({...input, suiteId: 22, pointId: 22201});
        finish(result); await first;
        const patched = store.applyConfirmations(snapshot, started);
        expect(patched.projections.find(p => p.suiteId === 21 && p.workItemId === 201)?.lastRunId).toBe(100);
        expect(patched.projections.find(p => p.suiteId === 22 && p.workItemId === 201)?.lastRunId).toBe(101);
        expect(port.load).not.toHaveBeenCalled();
    });
    it.each([new TypeError('Connection lost'), new ApiError(502, 'HTTP_502', 'Gateway'), new ApiError(408, 'HTTP_408', 'Timeout')])(
        'blocks further ordinary writes after an ambiguous response without inventing a run ID: %s', async error => {
            const {port, store} = await fixture(); port.record.mockRejectedValue(error);
            await store.record(input); await store.record(input);
            expect(port.record).toHaveBeenCalledTimes(1);
            expect(store.getSnapshot().blocked.has('21:201')).toBe(true);
            expect(store.getSnapshot().status).toBe('');
        });
});
