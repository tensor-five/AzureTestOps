import type { DataFreshness } from '../dto/data-freshness.dto.js';

export function combineDataFreshness(startedAt: string, values: readonly (DataFreshness | undefined)[]): DataFreshness {
  return values.reduce<DataFreshness>((oldest, value) => value ? {
    sourceReadAt: Date.parse(value.sourceReadAt) < Date.parse(oldest.sourceReadAt) ? value.sourceReadAt : oldest.sourceReadAt,
    cacheUsed: oldest.cacheUsed || value.cacheUsed
  } : oldest, { sourceReadAt: startedAt, cacheUsed: false });
}
