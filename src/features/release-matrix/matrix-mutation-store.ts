import type { MatrixSnapshot, MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import { ApiError } from '../../application/dto/api-error.js';

type Mutation = {
    pending: boolean; blocked?: boolean; error?: string; runId?: number;
    unconfirmed?: { runId: number; pointId: number; outcome: MatrixWrite['outcome']; failedAt: number };
};
export type MatrixMutationState = {
    pending: Set<string>;
    blocked: Set<string>;
    error: string;
    status: string;
    confirmationRevision: number;
};
export const emptyMatrixMutationState: MatrixMutationState = { pending: new Set(), blocked: new Set(), error: '', status: '', confirmationRevision: 0 };
let revision = 0;
export const getMatrixMutationRevision = () => revision;

/** Request lifetime is independent of the mounted view. Nothing in this store is persisted. */
export class MatrixMutationStore {
    private readonly mutations = new Map<string, Mutation>();
    private readonly listeners = new Set<() => void>();
    private state = emptyMatrixMutationState;
    private confirmationRevision = 0;

    constructor(private readonly port: ReleaseMatrixClientPort, private readonly setId: string,
        private readonly planId: number, private readonly contextIdentity: string) {}

    getSnapshot = (): MatrixMutationState => this.state;
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    /** A later accepted read must confirm the exact point/run and the run's Completed state. */
    reconcile(snapshot: MatrixSnapshot, readStartedAt: number): void {
        if (snapshot.planId !== this.planId || snapshot.contextIdentity !== this.contextIdentity) return;
        const completedRuns = new Set(snapshot.completedRunIds ?? []);
        let changed = false;
        for (const projection of snapshot.projections) {
            const key = `${projection.suiteId}:${projection.workItemId}`;
            const mutation = this.mutations.get(key), target = mutation?.unconfirmed;
            if (!mutation?.blocked || !target || readStartedAt < target.failedAt || !completedRuns.has(target.runId)) continue;
            // The unchanged point fallback has no result date when Azure omits testSuite.id.
            if (projection.lastRunId !== target.runId || projection.testPointId !== target.pointId
                || projection.lastOutcome !== target.outcome) continue;
            const confirmedResult = snapshot.resultEvidence?.some(result => result.runId === target.runId
                && result.workItemId === projection.workItemId && result.pointId === target.pointId
                && (result.suiteId === null || result.suiteId === projection.suiteId)
                && result.outcome === target.outcome && result.completedDate !== null
                && Number.isFinite(Date.parse(result.completedDate)));
            if (!confirmedResult) continue;
            this.mutations.set(key, { pending: false, runId: target.runId });
            changed = true;
        }
        // The caller already accepts this snapshot; do not trigger another reload or repeat the write.
        if (changed) this.publish();
    }

    private publish() {
        const entries = [...this.mutations];
        this.state = {
            pending: new Set(entries.filter(([, value]) => value.pending).map(([key]) => key)),
            blocked: new Set(entries.filter(([, value]) => value.blocked).map(([key]) => key)),
            error: entries.flatMap(([, value]) => value.error ? [value.error] : []).join(' '),
            status: entries.flatMap(([, value]) => value.runId ? [`Durchlauf bestätigt: ${value.runId}`] : []).join(' '),
            confirmationRevision: this.confirmationRevision,
        };
        this.listeners.forEach(listener => listener());
    }

    async record(input: MatrixWrite): Promise<void> {
        const key = `${input.suiteId}:${input.workItemId}`;
        if (this.mutations.get(key)?.pending || this.mutations.get(key)?.blocked) return;
        if (input.planId !== this.planId || input.contextIdentity !== this.contextIdentity) return;
        this.mutations.set(key, { pending: true });
        this.publish();
        try {
            const result = await this.port.record(this.setId, input);
            this.mutations.set(key, { pending: false, runId: result.runId });
            this.confirmationRevision = ++revision;
        } catch (error) {
            const blocked = error instanceof ApiError && error.code === 'MATRIX_RUN_UNCONFIRMED';
            const runId = error instanceof ApiError ? error.details?.runId : undefined;
            this.mutations.set(key, { pending: false,
                blocked,
                ...(blocked && typeof runId === 'number' && Number.isSafeInteger(runId) && runId > 0
                    ? { unconfirmed: { runId, pointId: input.pointId, outcome: input.outcome, failedAt: ++revision } } : {}),
                error: error instanceof Error ? error.message : 'Durchlauf konnte nicht gespeichert werden.' });
        }
        this.publish();
    }

}

const stores = new WeakMap<ReleaseMatrixClientPort, Map<string, MatrixMutationStore>>();
export function getMatrixMutationStore(port: ReleaseMatrixClientPort, setId: string, planId: number, contextIdentity: string): MatrixMutationStore {
    let scopes = stores.get(port);
    if (!scopes) { scopes = new Map(); stores.set(port, scopes); }
    const key = JSON.stringify([setId, planId, contextIdentity]);
    let store = scopes.get(key);
    if (!store) { store = new MatrixMutationStore(port, setId, planId, contextIdentity); scopes.set(key, store); }
    return store;
}
