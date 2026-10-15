import { expect, it } from 'vitest';
import { combineDataFreshness } from './data-freshness.js';

it('preserves the oldest source age across mixed fresh/cached data', () => {
  expect(combineDataFreshness('2026-10-15T10:00:30Z', [undefined,
    { sourceReadAt: '2026-10-15T10:00:31Z', cacheUsed: false },
    { sourceReadAt: '2026-10-15T10:00:00Z', cacheUsed: true }]))
    .toEqual({ sourceReadAt: '2026-10-15T10:00:00Z', cacheUsed: true });
});
