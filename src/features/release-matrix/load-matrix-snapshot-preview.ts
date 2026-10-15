import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import { snapshotDataTimestamp } from '../../shared/ui/snapshot-data-timestamp.js';

type PreviewRead = {
  setId: string; planId: number; contextIdentity: string; signal: AbortSignal;
  versionSuiteIds: readonly number[]; flatVersionSuiteIds: readonly number[];
};

/** An optional preview never delays or fails the authoritative read. */
export async function loadMatrixSnapshotPreview(port: ReleaseMatrixClientPort, read: PreviewRead): Promise<MatrixSnapshot | null> {
  if (!port.loadCached || read.signal.aborted) return null;
  try {
    const value = await port.loadCached(read.setId, read.signal, read.versionSuiteIds, read.flatVersionSuiteIds);
    if (read.signal.aborted || !value || value.planId !== read.planId || value.contextIdentity !== read.contextIdentity) return null;
    return snapshotDataTimestamp(value.freshness, Date.parse(value.loadedAt ?? '')) === null ? null : value;
  } catch {
    return null;
  }
}
