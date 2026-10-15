import type { DataFreshness } from '../../application/dto/data-freshness.dto.js';

/** Cache hits retain their original source date; receiving a response never makes old data younger. */
export function snapshotDataTimestamp(freshness: DataFreshness | undefined, loadedAt: number | null): number | null {
    const source = Date.parse(freshness?.sourceReadAt ?? '');
    const loaded = loadedAt !== null && Number.isFinite(loadedAt) ? loadedAt : null;
    return Number.isFinite(source) ? loaded === null ? source : Math.min(source, loaded) : loaded;
}
