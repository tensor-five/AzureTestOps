import type { MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';

type Mutation = { pending: boolean; error?: string; runId?: number };
export type MatrixMutationState = {
    pending: Set<string>;
    error: string;
    status: string;
    confirmationRevision: number;
};
export const emptyMatrixMutationState: MatrixMutationState = { pending: new Set(), error: '', status: '', confirmationRevision: 0 };
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

    private publish() {
        const entries = [...this.mutations];
        this.state = {
            pending: new Set(entries.filter(([, value]) => value.pending).map(([key]) => key)),
            error: entries.flatMap(([, value]) => value.error ? [value.error] : []).join(' '),
            status: entries.flatMap(([, value]) => value.runId ? [`Durchlauf bestätigt: ${value.runId}`] : []).join(' '),
            confirmationRevision: this.confirmationRevision,
        };
        this.listeners.forEach(listener => listener());
    }

    async record(input: MatrixWrite): Promise<void> {
        const key = `${input.suiteId}:${input.workItemId}`;
        if (this.mutations.get(key)?.pending) return;
        if (input.planId !== this.planId || input.contextIdentity !== this.contextIdentity) return;
        this.mutations.set(key, { pending: true });
        this.publish();
        try {
            const result = await this.port.record(this.setId, input);
            this.mutations.set(key, { pending: false, runId: result.runId });
            this.confirmationRevision = ++revision;
        } catch (error) {
            this.mutations.set(key, { pending: false,
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
