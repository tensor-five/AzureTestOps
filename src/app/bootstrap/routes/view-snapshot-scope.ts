import type { Set } from '../../../domain/sets/set.js';
import type { SnapshotScope, ViewSnapshots } from '../../../application/ports/view-snapshot-cache.port.js';

/** Include all set metadata carried by a snapshot; actual context is resolved independently by each view. */
export function viewSnapshotScope<K extends keyof ViewSnapshots>(view: K, contextIdentity: string, set: Set,
  selection?: { versionSuiteIds?: readonly number[]; flatVersionSuiteIds?: readonly number[] }): SnapshotScope<K> {
  const normalize = (ids?: readonly number[]) => ids === undefined ? null : [...new Set(ids)].sort((a, b) => a - b);
  return { view, contextIdentity, planId: Number(set.planId), identity: JSON.stringify([
    set.id, set.name, set.planId, set.planName, set.rootSuiteId, set.rootSuiteName, set.queryId, set.queryName, set.organization, set.project,
    normalize(selection?.versionSuiteIds), normalize(selection?.flatVersionSuiteIds)
  ]) };
}
