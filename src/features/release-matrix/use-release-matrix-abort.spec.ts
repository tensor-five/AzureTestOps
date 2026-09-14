// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import { useReleaseMatrix } from './use-release-matrix.js';
vi.mock('./matrix-preference-store.js', () => ({ matrixPreferenceStore: { load: () => null, save: vi.fn() } }));
afterEach(cleanup);
describe('matrix read lifecycle cancellation', () => {
    it('aborts replaced reads and navigation without showing cancellation as a user error', async () => {
        const signals: AbortSignal[] = [];
        const port = { load: vi.fn((_set: string, signal?: AbortSignal) => new Promise<MatrixSnapshot>((_, reject) => {
            signals.push(signal!);
            signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        })), record: vi.fn() };
        const hook = renderHook(() => useReleaseMatrix('catalog', 1, 10, port));
        let reload!: Promise<void>;
        await act(async () => { reload = hook.result.current.reload(); });
        expect(signals).toHaveLength(2); expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
        expect(hook.result.current.error).toBe('');
        await act(async () => { hook.unmount(); await reload; });
        expect(signals[1].aborted).toBe(true);
    });
});
