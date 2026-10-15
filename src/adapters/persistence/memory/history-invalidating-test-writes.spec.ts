import { describe, expect, it, vi } from 'vitest';
import { historyInvalidatingTestWrites } from './history-invalidating-test-writes.js';

describe('history invalidation on test writes', () => {
  it.each(['create', 'result', 'run', 'reset'] as const)('invalidates before and after an uncertain %s write', async operation => {
    const events: string[] = [];
    const fail = async () => { events.push('write'); throw new Error('write unconfirmed'); };
    const begin = vi.fn((planId?: number) => { events.push(`before:${planId ?? 'context'}`); return () => { events.push('after'); }; });
    const ports = historyInvalidatingTestWrites({ createManualRun: fail, completeResult: fail, completeRun: fail }, { resetToActive: fail }, begin);
    const actions = { create: () => ports.execution.createManualRun(1, 20), result: () => ports.execution.completeResult(10, 11, 'Passed'),
      run: () => ports.execution.completeRun(10), reset: () => ports.pointReset.resetToActive(1, 2, 3) };
    await expect(actions[operation]()).rejects.toThrow('write unconfirmed');
    expect(events).toEqual([`before:${operation === 'create' || operation === 'reset' ? 1 : 'context'}`, 'write', 'after']);
  });

  it('preserves successful transport return values', async () => {
    const finish = vi.fn();
    const ports = historyInvalidatingTestWrites({ createManualRun: async () => 100, completeResult: async () => {}, completeRun: async () => {} },
      { resetToActive: async () => {} }, () => finish);
    expect(await ports.execution.createManualRun(1, 20)).toBe(100);
    expect(finish).toHaveBeenCalledOnce();
  });
});
