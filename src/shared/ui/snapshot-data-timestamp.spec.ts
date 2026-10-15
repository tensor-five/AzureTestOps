import { describe, expect, it } from 'vitest';
import { snapshotDataTimestamp } from './snapshot-data-timestamp.js';

describe('snapshot source date', () => {
    it('keeps the older source timestamp when cached data arrives in a new response', () => {
        expect(snapshotDataTimestamp({ sourceReadAt: '2026-10-15T07:00:00Z', cacheUsed: true }, Date.parse('2026-10-15T07:00:45Z'))).toBe(Date.parse('2026-10-15T07:00:00Z'));
    });
    it('uses the completed load timestamp for older servers without freshness metadata', () => {
        expect(snapshotDataTimestamp(undefined, 1234)).toBe(1234);
        expect(snapshotDataTimestamp({ sourceReadAt: 'invalid', cacheUsed: true }, 1234)).toBe(1234);
    });
    it('does not make data younger than a locally known completed load', () => {
        expect(snapshotDataTimestamp({ sourceReadAt: '2026-10-15T07:01:00Z', cacheUsed: false }, 1234)).toBe(1234);
    });
    it('does not invent an update time for missing or invalid snapshots', () => {
        expect(snapshotDataTimestamp(undefined, null)).toBeNull();
        expect(snapshotDataTimestamp(undefined, NaN)).toBeNull();
    });
});
