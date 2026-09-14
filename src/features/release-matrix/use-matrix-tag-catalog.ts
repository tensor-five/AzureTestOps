import * as React from 'react';
import type { MatrixTagCatalog } from '../../application/dto/release-matrix.dto.js';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';

type Scope = { setId: string; planId: number; contextIdentity?: string };
type Entry = { key: string; value: MatrixTagCatalog; loadedAt: number };
type State = { key: string; loading: boolean; entry?: Entry; error?: string };
const isFresh = (entry: Entry) => Date.now() >= entry.loadedAt && Date.now() - entry.loadedAt < 60_000;

/** The complete tag catalogue is only needed when the tag selector is opened. */
export function useMatrixTagCatalog(port: ReleaseMatrixClientPort | undefined, scope: Scope, readGeneration: number) {
  const key = JSON.stringify([scope.setId, scope.planId, scope.contextIdentity, readGeneration]);
  const currentKey = React.useRef(key);
  currentKey.current = key;
  const cache = React.useRef<Entry | undefined>(undefined);
  const active = React.useRef<{ key: string; controller: AbortController } | undefined>(undefined);
  const [state, setState] = React.useState<State>({ key: '', loading: false });
  React.useEffect(() => () => { active.current?.controller.abort(); active.current = undefined; }, [key, port]);
  const load = React.useCallback(() => {
    if (!port?.loadTagCatalog || !scope.contextIdentity) return;
    if (active.current?.key === key && !active.current.controller.signal.aborted) return;
    const cached = cache.current;
    if (cached?.key === key && isFresh(cached)) { setState({ key, loading: false, entry: cached }); return; }
    active.current?.controller.abort();
    const controller = new AbortController();
    active.current = { key, controller };
    setState({ key, loading: true });
    void port.loadTagCatalog(scope.setId, scope.contextIdentity, controller.signal).then(value => {
      if (controller.signal.aborted || currentKey.current !== key) return;
      if (value.planId !== scope.planId || value.contextIdentity !== scope.contextIdentity
        || !Array.isArray(value.tags) || !value.tags.every(tag => typeof tag === 'string')) {
        throw new Error('Tagkatalog passt nicht zur aktiven Matrix.');
      }
      const entry = { key, value, loadedAt: Date.now() };
      cache.current = entry;
      setState({ key, loading: false, entry });
    }).catch(() => {
      if (!controller.signal.aborted && currentKey.current === key)
        setState({ key, loading: false, error: 'Tags konnten nicht geladen werden. Bitte die Tag-Auswahl erneut öffnen.' });
    }).finally(() => { if (active.current?.controller === controller) active.current = undefined; });
  }, [port, key, scope.setId, scope.planId, scope.contextIdentity]);
  const current = state.key === key ? state : undefined;
  return { load, tags: current?.entry && isFresh(current.entry) ? current.entry.value.tags : [],
    loading: current?.loading ?? false, error: current?.error ?? '' };
}
