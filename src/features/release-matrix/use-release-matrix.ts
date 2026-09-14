import { matrixSnapshotCache } from './matrix-snapshot-cache.js';
import { useMatrixSuiteMembership } from './use-matrix-suite-membership.js';
import { useMatrixTagCatalog } from './use-matrix-tag-catalog.js';
import * as React from 'react';
import { createTransientNotification, type TransientNotification } from '../../shared/ui/transient-notification.js';
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
    const [readNotification, setReadNotification] = React.useState<TransientNotification | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [membershipGeneration, setMembershipGeneration] = React.useState(0);
    const alive = React.useRef(true);
    const request = React.useRef(0);
    const activeRead = React.useRef<AbortController | null>(null);
    const contextIdentity = snapshot?.contextIdentity ?? expectedContextIdentity;
    const mutationStore = React.useMemo(() => port && contextIdentity
        ? getMatrixMutationStore(port, setId, planId, contextIdentity) : null,
        [port, setId, planId, contextIdentity]);
    const mutation = React.useSyncExternalStore(mutationStore?.subscribe ?? subscribeWithoutStore,
        mutationStore?.getSnapshot ?? getEmptyMutationState);
    const selectedKey = JSON.stringify([...new Set(config.columns.map(c => c.versionSuiteId).filter(id => id > 0))].sort((a, b) => a - b));
    const cacheKey = expectedContextIdentity ? JSON.stringify([setId, planId, rootSuiteId, expectedContextIdentity, selectedKey]) : null;
    const accepted = React.useRef<{ store: MatrixMutationStore; readStartedAt: number; selectedKey: string } | null>(null);
    const reload = React.useCallback(async (background = false, reuseCache = false) => {
        activeRead.current?.abort();
        const controller = new AbortController();
        activeRead.current = controller;
        const version = ++request.current;
        if (!background || reuseCache) setLoading(true);
        if (!background) setSnapshot(null);
        try {
            if (!port)
                throw new Error('Release-Matrix ist nicht verfügbar.');
            const cache = matrixSnapshotCache(port);
            const knownStore = expectedContextIdentity ? getMatrixMutationStore(port, setId, planId, expectedContextIdentity) : null;
            const cached = reuseCache && cacheKey && !knownStore?.getSnapshot().blocked.size ? cache.get(cacheKey) : undefined;
            if (cacheKey && !cached) cache.invalidate(cacheKey);
            const readStartedAt = cached?.readStartedAt ?? getMatrixMutationRevision();
            const value = cached?.snapshot ?? await port.load(setId, controller.signal, JSON.parse(selectedKey) as number[]);
            const store = getMatrixMutationStore(port, setId, value.planId, value.contextIdentity);
            if (alive.current && version === request.current) {
                if (!cached) store.reconcile(value, readStartedAt);
                if (!cached && cacheKey && value.contextIdentity === expectedContextIdentity && value.planId === planId)
                    cache.set(cacheKey, {setId, snapshot: value, readStartedAt, loadedAt: Date.now()});
                accepted.current = { store, readStartedAt, selectedKey };
                setMembershipGeneration(version);
                setSnapshot(store.applyConfirmations(value, readStartedAt));
                setError('');
            }
        }
        catch (e) {
            if (!controller.signal.aborted && alive.current && version === request.current) {
                const message = `Matrix konnte nicht geladen werden. ${e instanceof Error ? e.message : ''}`;
                setError(message);
                setReadNotification(createTransientNotification(message, 'error'));
            }
        }
        finally {
            if (alive.current && version === request.current)
                setLoading(false);
        }
    }, [setId, planId, port, expectedContextIdentity, cacheKey, selectedKey]);
    React.useEffect(() => {
        const read = accepted.current;
        if (mutationStore && read?.store === mutationStore) {
            setSnapshot(value => value ? mutationStore.applyConfirmations(value, read.readStartedAt) : value);
        }
    }, [mutationStore, mutation.confirmationRevision]);
    React.useEffect(() => { alive.current = true; void reload(true, true); return () => { alive.current = false; request.current++; activeRead.current?.abort(); }; }, [reload]);
    React.useEffect(() => {
        if (config.migratedFrom) matrixPreferenceStore.save(config, { scopeKey: setId });
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
    const membership = useMatrixSuiteMembership(port, { setId, planId, contextIdentity }, snapshot, config.suiteFilter, membershipGeneration);
    const tagCatalog = useMatrixTagCatalog(port, { setId, planId, contextIdentity }, membershipGeneration);
    React.useEffect(() => {
        if (tagCatalog.error) setReadNotification(createTransientNotification(tagCatalog.error, 'error'));
    }, [tagCatalog.error]);
    React.useEffect(() => {
        if (membership.error) setReadNotification(createTransientNotification(membership.error, 'error'));
    }, [membership.error]);
    const stale = snapshot !== null && (error.length > 0 || accepted.current?.selectedKey !== selectedKey || membership.pending);
    const record = async (input: MatrixWrite) => {
        if (stale || loading) return;
        await mutationStore?.record(input);
    };
    const mutationError = mutation.error && !snapshot ? `${mutation.error} Azure-Kontext: ${contextIdentity}.` : mutation.error;
    const staleMessage = stale && error.length > 0 ? 'Die angezeigte Matrix ist veraltet. Weitere Änderungen sind bis zum erfolgreichen Aktualisieren gesperrt.' : '';
    const notification = (mutation.notification?.id ?? 0) > (readNotification?.id ?? 0) ? mutation.notification : readNotification;
    return { config, update, snapshot: membership.snapshot, stale, error: [error, membership.error, mutationError, staleMessage].filter(Boolean).join(' '),
        notification,
        tagCatalog: tagCatalog.tags, loadTags: tagCatalog.load, tagsLoading: tagCatalog.loading,
        status: mutation.status, loading: loading || membership.loading, pending: mutation.pending, blocked: mutation.blocked, record, reload };
}
