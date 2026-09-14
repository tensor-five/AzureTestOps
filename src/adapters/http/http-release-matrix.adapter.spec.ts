// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpReleaseMatrixAdapter } from './http-release-matrix.adapter.js';
describe('matrix browser transport diagnostics', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
    it('loads one filter membership with its context and abort signal without a matrix read', async () => {
        const value = { planId: 1, suiteId: 43, contextIdentity: 'https://dev.azure.com/org/project', workItemIds: [201] };
        const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, text: async () => JSON.stringify(value) }));
        vi.stubGlobal('fetch', fetch);
        const controller = new AbortController();
        expect(await new HttpReleaseMatrixAdapter().loadMembership('set id', 43, value.contextIdentity, controller.signal)).toEqual(value);
        const [url, init] = fetch.mock.calls[0];
        expect(new URL(url, 'http://localhost').pathname).toBe('/phase2/sets/set%20id/release-matrix/memberships/43');
        expect(new URL(url, 'http://localhost').searchParams.get('contextIdentity')).toBe(value.contextIdentity);
        expect(init.signal).toBe(controller.signal);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('correlates its read with the backend and forwards the abort signal', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});
        const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, text: async () => JSON.stringify({ planId: 1, suites: [], projections: [] }) }));
        vi.stubGlobal('fetch', fetch);
        const controller = new AbortController();
        await new HttpReleaseMatrixAdapter().load('catalog', controller.signal);
        const init = fetch.mock.calls[0]?.[1] as RequestInit;
        expect(init.signal).toBe(controller.signal);
        const id = (init.headers as Record<string, string>)['x-matrix-request-id'];
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        expect(log.mock.calls.map(call => call[1].event)).toEqual(['start', 'progress', 'complete']);
        expect(log.mock.calls.every(call => call[1].requestId === id)).toBe(true);
    });
    it('logs cancellation without exposing a raw transport error', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});
        const controller = new AbortController();
        vi.stubGlobal('fetch', vi.fn(async () => { controller.abort(); throw new Error('token=secret'); }));
        await expect(new HttpReleaseMatrixAdapter().load('catalog', controller.signal)).rejects.toThrow();
        expect(log.mock.calls.at(-1)?.[1].event).toBe('aborted');
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    });
});
