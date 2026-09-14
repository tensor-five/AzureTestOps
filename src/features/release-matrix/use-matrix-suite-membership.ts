import * as React from 'react';
import type { MatrixSnapshot, MatrixSuiteMembership } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';

type MembershipScope = { setId: string; planId: number; contextIdentity?: string };
type CachedMembership = { value: MatrixSuiteMembership; loadedAt: number };
type MembershipState = { key: string; entry?: CachedMembership; error?: string };
const MAX_AGE_MS = 60_000;
const isFresh = (entry: CachedMembership, now: number) => now >= entry.loadedAt && now - entry.loadedAt < MAX_AGE_MS;

/** Read only the missing filter membership. Cache stays local to this mounted view. */
export function useMatrixSuiteMembership(port: ReleaseMatrixClientPort | undefined, scope: MembershipScope,
  snapshot: MatrixSnapshot | null, suiteFilter: string, readGeneration: number) {
  const [state, setState] = React.useState<MembershipState>({ key: '' });
  const cache = React.useRef({ scopeKey: '', entries: new Map<number, CachedMembership>() });
  const scopeKey = JSON.stringify([scope.setId, scope.planId, scope.contextIdentity, readGeneration]);
  const suiteId = Number(suiteFilter);
  const key = JSON.stringify([scopeKey, suiteFilter]);
  const currentKey = React.useRef(key);
  currentKey.current = key;
  const validSuite = Number.isSafeInteger(suiteId) && suiteId > 0;
  const scopeMatches = snapshot?.planId === scope.planId && snapshot.contextIdentity === scope.contextIdentity;
  const supplied = !!snapshot?.suiteMemberships && Object.hasOwn(snapshot.suiteMemberships, suiteFilter);
  const legacy = snapshot?.suiteMemberships === undefined && !port?.loadMembership;
  const missing = !!snapshot && scopeMatches && !!suiteFilter && !supplied && !legacy;
  const entry = state.key === key && state.entry && isFresh(state.entry, Date.now()) ? state.entry : undefined;
  const error = missing && state.key === key ? state.error ?? '' : '';
  const shouldLoad = missing && !entry && !error;

  React.useEffect(() => {
    if (!shouldLoad) return;
    const fail = (message: string) => setState({ key, error: message });
    if (!validSuite) { fail('Ungültige Filter-Suite. Bitte den Suite-Filter ändern.'); return; }
    if (!port?.loadMembership || !scope.contextIdentity) {
      fail('Suite-Zugehörigkeit kann nicht geladen werden. Bitte die Matrix aktualisieren.'); return;
    }
    if (cache.current.scopeKey !== scopeKey) cache.current = { scopeKey, entries: new Map() };
    const cached = cache.current.entries.get(suiteId);
    if (cached && isFresh(cached, Date.now())) { setState({ key, entry: cached }); return; }
    const controller = new AbortController();
    let active = true;
    void port.loadMembership(scope.setId, suiteId, scope.contextIdentity, controller.signal).then(value => {
      if (!active || controller.signal.aborted || currentKey.current !== key) return;
      if (value.planId !== scope.planId || value.suiteId !== suiteId || value.contextIdentity !== scope.contextIdentity
        || !Array.isArray(value.workItemIds) || !value.workItemIds.every(id => Number.isSafeInteger(id) && id > 0)) {
        fail('Suite-Zugehörigkeit passt nicht zur aktiven Matrix. Bitte die Matrix aktualisieren.'); return;
      }
      const next = { value, loadedAt: Date.now() };
      cache.current.entries.delete(suiteId);
      cache.current.entries.set(suiteId, next);
      while (cache.current.entries.size > 16) cache.current.entries.delete(cache.current.entries.keys().next().value!);
      setState({ key, entry: next });
    }, () => {
      if (active && !controller.signal.aborted && currentKey.current === key)
        fail('Suite-Zugehörigkeit konnte nicht geladen werden. Bitte die Matrix aktualisieren.');
    });
    return () => { active = false; controller.abort(); };
  }, [shouldLoad, validSuite, port, key, scopeKey, scope.setId, scope.planId, scope.contextIdentity, suiteId]);

  const value = missing && entry && snapshot ? { ...snapshot,
    suiteMemberships: { ...snapshot.suiteMemberships, [suiteFilter]: entry.value.workItemIds } } : snapshot;
  return { snapshot: value, loading: missing && !entry && !error, pending: missing && !entry, error };
}
