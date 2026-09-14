import * as React from 'react';
import type { MatrixSnapshot, MatrixWrite } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import { matrixPreferenceStore } from './matrix-preference-store.js';
import { emptyMatrixConfig, type MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
import { emptyMatrixMutationState, getMatrixMutationRevision, getMatrixMutationStore, type MatrixMutationStore } from './matrix-mutation-store.js';
const subscribeWithoutStore = () => () => {};
const getEmptyMutationState = () => emptyMatrixMutationState;
export function useReleaseMatrix(setId: string, planId: number, rootSuiteId: number, port: ReleaseMatrixClientPort | undefined, expectedContextIdentity?: string) {
    const [config, setConfig] = React.useState(() => { const saved = matrixPreferenceStore.load({ scopeKey: setId }); return saved?.planId === planId ? saved : emptyMatrixConfig(planId, rootSuiteId); });
    const [snapshot, setSnapshot] = React.useState<MatrixSnapshot | null>(null);
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const alive = React.useRef(true);
    const request = React.useRef(0);
    const activeRead = React.useRef<AbortController | null>(null);
    const contextIdentity = snapshot?.contextIdentity ?? expectedContextIdentity;
    const mutationStore = React.useMemo(() => port && contextIdentity
        ? getMatrixMutationStore(port, setId, planId, contextIdentity) : null,
        [port, setId, planId, contextIdentity]);
    const mutation = React.useSyncExternalStore(mutationStore?.subscribe ?? subscribeWithoutStore,
        mutationStore?.getSnapshot ?? getEmptyMutationState);
    const observed = React.useRef<{ store: MatrixMutationStore; revision: number } | null>(null);
    const reload = React.useCallback(async (background = false) => {
        activeRead.current?.abort();
        const controller = new AbortController();
        activeRead.current = controller;
        const version = ++request.current;
        if (!background) setLoading(true);
        if (!background) setSnapshot(null);
        try {
            if (!port)
                throw new Error('Release-Matrix ist nicht verfügbar.');
            let value: MatrixSnapshot;
            let store: MatrixMutationStore;
            let readStartedAt: number;
            do {
                readStartedAt = getMatrixMutationRevision();
                value = await port.load(setId, controller.signal);
                store = getMatrixMutationStore(port, setId, value.planId, value.contextIdentity);
            } while (alive.current && version === request.current && store.getSnapshot().confirmationRevision > readStartedAt);
            if (alive.current && version === request.current) {
                setSnapshot(value);
                setError('');
                observed.current = { store, revision: store.getSnapshot().confirmationRevision };
            }
        }
        catch (e) {
            if (!controller.signal.aborted && alive.current && version === request.current)
                setError(`Matrix konnte nicht geladen werden. ${e instanceof Error ? e.message : ''}`);
        }
        finally {
            if (alive.current && version === request.current)
                setLoading(false);
        }
    }, [setId, port]);
    React.useEffect(() => {
        const previous = observed.current;
        if (mutationStore && previous?.store === mutationStore && previous.revision < mutation.confirmationRevision) {
            observed.current = { store: mutationStore, revision: mutation.confirmationRevision };
            void reload(true);
        }
    }, [mutationStore, mutation.confirmationRevision, reload]);
    React.useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; request.current++; activeRead.current?.abort(); }; }, [reload]);
    React.useEffect(() => {
        if (config.migratedFrom === 1) matrixPreferenceStore.save(config, { scopeKey: setId });
        // Persist the idempotently migrated configuration once when this set is mounted.
        // Further edits already use update() below.
    }, [setId]);
    const configRef = React.useRef(config);
    const update = React.useCallback((patch: Partial<MatrixConfig>) => {
        const next = { ...configRef.current, ...patch };
        configRef.current = next;
        setConfig(next);
        matrixPreferenceStore.save(next, { scopeKey: setId });
    }, [setId]);
    const stale = snapshot !== null && error.length > 0;
    const record = async (input: MatrixWrite) => {
        if (stale) return;
        await mutationStore?.record(input);
    };
    const mutationError = mutation.error && !snapshot ? `${mutation.error} Azure-Kontext: ${contextIdentity}.` : mutation.error;
    const staleMessage = stale ? 'Die angezeigte Matrix ist veraltet. Weitere Änderungen sind bis zum erfolgreichen Aktualisieren gesperrt.' : '';
    return { config, update, snapshot, stale, error: [error, mutationError, staleMessage].filter(Boolean).join(' '),
        status: mutation.status, loading, pending: mutation.pending, record, reload };
}
