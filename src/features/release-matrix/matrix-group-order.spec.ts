import { describe, expect, it } from 'vitest';
import { moveVisibleMatrixGroup } from './matrix-group-order.js';

describe('Filtered matrix group ordering', () => {
    it('moves visible neighbours while preserving hidden groups and their positions', () => {
        const order = ['C', 'B', 'A'];
        expect(moveVisibleMatrixGroup(order, ['C', 'A'], 'A', -1)).toEqual(['A', 'B', 'C']);
        expect(order).toEqual(['C', 'B', 'A']);
    });
    it('preserves every hidden group when moving down through a filtered view', () => {
        expect(moveVisibleMatrixGroup(['X', 'A', 'B', 'C', 'D'], ['A', 'D'], 'A', 1)).toEqual(['X', 'D', 'B', 'C', 'A']);
    });
    it('keeps boundary moves unchanged and includes newly discovered visible groups once', () => {
        expect(moveVisibleMatrixGroup(['A', 'B'], ['A', 'B'], 'A', -1)).toEqual(['A', 'B']);
        expect(moveVisibleMatrixGroup(['A', 'B'], ['A', 'B'], 'B', 1)).toEqual(['A', 'B']);
        expect(moveVisibleMatrixGroup(['A', 'A'], ['A', 'B'], 'B', -1)).toEqual(['B', 'A']);
    });
});
