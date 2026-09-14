import { validateMatrixConfirmation } from './validate-matrix-confirmation.js';
import type { MatrixSnapshot, MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import type { TestCaseOutcomeUpdate } from '../../domain/test-management/test-case-outcome-update.js';
import { applyConfirmedOutcomes } from '../../shared/test-management/apply-confirmed-outcomes.js';
import { ApiError } from '../../application/dto/api-error.js';

type Mutation = {
    pending: boolean; reset?: boolean; unconfirmedReset?: {pointId: number; failedAt: number}; blocked?: boolean; error?: string; runId?: number;
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
    // Keep only the latest confirmation per physical point, scoped to this set/context.
    // Only reads started before that confirmation receive the overlay.
    private readonly confirmations = new Map<string, { revision: number; projection: TestCaseOutcomeUpdate }>();
    applyConfirmations(snapshot: MatrixSnapshot, readStartedAt: number): MatrixSnapshot {
        if (snapshot.planId !== this.planId || snapshot.contextIdentity !== this.contextIdentity) return snapshot;
        const updates = [...this.confirmations.values()].filter(value => value.revision > readStartedAt).map(value => value.projection);
        return updates.length ? { ...snapshot, projections: applyConfirmedOutcomes(snapshot.projections, updates) } : snapshot;
    }
    private readonly mutations = new Map<string, Mutation>();
    private readonly listeners = new Set<() => void>();
    private readonly confirmationListeners = new Set<(projection: TestCaseOutcomeUpdate) => void>();
    subscribeConfirmed = (listener: (projection: TestCaseOutcomeUpdate) => void): (() => void) => {
        this.confirmationListeners.add(listener);
        return () => { this.confirmationListeners.delete(listener); };
    };
    private confirm(projection: TestCaseOutcomeUpdate) {
        this.confirmationListeners.forEach(listener => listener(projection));
    }
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
            const reset = mutation?.unconfirmedReset;
            if (mutation?.blocked && reset && readStartedAt >= reset.failedAt
                && projection.testPointId === reset.pointId && projection.lastOutcome === 'Unspecified'
                && projection.lastRunId === null && projection.lastResultId === null
                && snapshot.activePoints?.some(point => point.pointId === reset.pointId
                    && point.suiteId === projection.suiteId && point.workItemId === projection.workItemId)) {
                this.mutations.set(key, { pending: false, reset: true });
                this.confirm(projection);
                changed = true;
                continue;
            }
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
            this.confirm(projection);
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
            status: entries.flatMap(([, value]) => value.reset ? ['Auf Active zurückgesetzt.'] : value.runId ? [`Durchlauf bestätigt: ${value.runId}`] : []).join(' '),
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
            validateMatrixConfirmation(result, input);
            this.mutations.set(key, { pending: false, runId: result.runId ?? undefined, reset: result.runId === null });
            this.confirmationRevision = ++revision;
            this.confirmations.set(`${input.suiteId}:${input.workItemId}:${input.pointId}`, {
                revision: this.confirmationRevision, projection: result.projection,
            });
            this.confirm(result.projection);
        } catch (error) {
            const lostResetResponse = input.outcome === 'ResetToActive' && (!(error instanceof ApiError)
                || (error.status >= 500 || error.status === 408) && error.code !== 'MATRIX_RESET_UNCONFIRMED' && error.code !== 'MATRIX_RESET_NOT_ATTEMPTED');
            const resetBlocked = lostResetResponse || error instanceof ApiError && error.code === 'MATRIX_RESET_UNCONFIRMED';
            const lostWriteResponse = input.outcome !== 'ResetToActive' && (!(error instanceof ApiError)
                || (error.status >= 500 || error.status === 408) && error.code !== 'MATRIX_WRITE_NOT_ATTEMPTED' && error.code !== 'MATRIX_RUN_UNCONFIRMED');
            const blocked = resetBlocked || lostWriteResponse || error instanceof ApiError && error.code === 'MATRIX_RUN_UNCONFIRMED';
            const runId = error instanceof ApiError ? error.details?.runId : undefined;
            this.mutations.set(key, { pending: false,
                blocked,
                ...(resetBlocked && (lostResetResponse || error instanceof ApiError && error.details?.pointId === input.pointId)
                    ? {unconfirmedReset: {pointId: input.pointId, failedAt: ++revision}} : {}),
                ...(!resetBlocked && blocked && typeof runId === 'number' && Number.isSafeInteger(runId) && runId > 0
                    ? { unconfirmed: { runId, pointId: input.pointId, outcome: input.outcome, failedAt: ++revision } } : {}),
                error: lostResetResponse ? `Reset auf Active für Testpunkt ${input.pointId} wurde nicht bestätigt. Bitte Azure prüfen und die Ansicht aktualisieren; es wird nicht automatisch erneut gespeichert.`
                    : lostWriteResponse ? `${error instanceof Error ? error.message : 'Statusänderung konnte nicht bestätigt werden.'} Bitte Azure prüfen; erneutes Speichern ist gesperrt.`
                    : error instanceof Error ? error.message : 'Statusänderung konnte nicht gespeichert werden.' });
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
