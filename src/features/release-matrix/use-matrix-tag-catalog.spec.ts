// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MatrixTagCatalog } from '../../application/dto/release-matrix.dto.js';
import { useMatrixTagCatalog } from './use-matrix-tag-catalog.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const scope = { setId: 'catalog', planId: 1, contextIdentity: 'context' };
const value = { planId: 1, contextIdentity: 'context', tags: ['Regress'] };

it('loads only on demand, shares in-flight reads and expires from original completion time', async () => {
  let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  const port = { load: vi.fn(), record: vi.fn(), loadTagCatalog: vi.fn(async () => value) };
  const { result } = renderHook(() => useMatrixTagCatalog(port, scope, 1));
  expect(port.loadTagCatalog).not.toHaveBeenCalled();
  act(() => { result.current.load(); result.current.load(); });
  await waitFor(() => expect(result.current.tags).toEqual(['Regress']));
  now += 59_000; act(() => result.current.load());
  expect(port.loadTagCatalog).toHaveBeenCalledTimes(1);
  now += 1001; act(() => result.current.load());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(port.loadTagCatalog).toHaveBeenCalledTimes(2);
  expect(port.load).not.toHaveBeenCalled();
});

it.each(['set', 'context', 'generation'])('aborts and ignores late answers after %s changes, waiting for a new focus', async change => {
  let resolve!: (value: MatrixTagCatalog) => void;
  const port = { load: vi.fn(), record: vi.fn(), loadTagCatalog: vi.fn((_set: string, _context: string, _signal?: AbortSignal) => new Promise<MatrixTagCatalog>(r => { resolve = r; })) };
  const { result, rerender } = renderHook(props => useMatrixTagCatalog(port, props.scope, props.generation), { initialProps: { scope, generation: 1 } });
  act(() => result.current.load());
  const signal = port.loadTagCatalog.mock.calls[0][2]!;
  rerender({ scope: { ...scope, ...(change === 'set' ? { setId: 'other' } : change === 'context' ? { contextIdentity: 'other' } : {}) }, generation: change === 'generation' ? 2 : 1 });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(value));
  expect(result.current.tags).toEqual([]);
  expect(port.loadTagCatalog).toHaveBeenCalledTimes(1);
});

it('surfaces failure and permits another explicit focus attempt', async () => {
  const port = { load: vi.fn(), record: vi.fn(), loadTagCatalog: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(value) };
  const { result } = renderHook(() => useMatrixTagCatalog(port, scope, 1));
  act(() => result.current.load());
  await waitFor(() => expect(result.current.error).toContain('Tags konnten nicht geladen werden'));
  act(() => result.current.load());
  await waitFor(() => expect(result.current.tags).toEqual(['Regress']));
  expect(result.current.error).toBe('');
});
it.each([{...value,planId:2},{...value,contextIdentity:'another'},{...value,tags:[42]}])('rejects a catalog with mismatched identity or invalid tags',async response=>{
 const port={load:vi.fn(),record:vi.fn(),loadTagCatalog:vi.fn(async()=>response as MatrixTagCatalog)};
 const hook=renderHook(()=>useMatrixTagCatalog(port,scope,1));act(()=>hook.result.current.load());
 await waitFor(()=>expect(hook.result.current.error).toContain('Tags konnten nicht geladen werden'));expect(hook.result.current.tags).toEqual([]);
});
it('does not load without a known scope or optional legacy capability',()=>{
 const port={load:vi.fn(),record:vi.fn(),loadTagCatalog:vi.fn()};
 const a=renderHook(()=>useMatrixTagCatalog(port,{...scope,contextIdentity:undefined},1));act(()=>a.result.current.load());expect(port.loadTagCatalog).not.toHaveBeenCalled();
 const b=renderHook(()=>useMatrixTagCatalog({load:vi.fn(),record:vi.fn()},scope,1));act(()=>b.result.current.load());expect(b.result.current.loading).toBe(false);
});
