import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import type { AdoRuntime } from '../../composition/runtime.js';
import type { SetRepositoryPort } from '../../../application/ports/set-repository.port.js';
import type { Set } from '../../../domain/sets/set.js';
import { matrixTestServices } from '../../../../tests/fixtures/release-matrix.js';
import { registerReleaseMatrixRoutes } from './release-matrix-routes.js';

const path = '/phase2/sets/catalog/release-matrix';
const target = { planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'Blocked' };

function setup() {
    const { services, azure } = matrixTestServices();
    const context = { organization: 'contract-org', project: 'contract-project' };
    const set: Set = { id: 'catalog', name: 'Catalog', planId: '1', rootSuiteId: '1', queryId: '' };
    const matrixServices = vi.fn((_context: typeof context) => services);
    const resolveContext = vi.fn(async () => context);
    const route = registerReleaseMatrixRoutes({ resolveContext, matrixServices } as unknown as AdoRuntime,
        { getById: async () => set } as unknown as SetRepositoryPort);
    const call = async (method: 'GET' | 'POST', body?: unknown) => {
        const response = { status: 0, body: {} as Record<string, unknown> };
        const res = {
            set statusCode(value: number) { response.status = value; },
            setHeader() {}, end(value: string) { response.body = JSON.parse(value); },
        } as unknown as ServerResponse;
        await route(method, path + (method === 'POST' ? '/outcomes' : ''),
            Readable.from([Buffer.from(JSON.stringify(body ?? {}))]) as IncomingMessage, res);
        return response;
    };
    return { call, context, set, matrixServices, resolveContext, azure };
}

describe('Matrix write context binding', () => {
    it('rejects a snapshot from another project before starting Azure work even with identical numeric IDs', async () => {
        const fixture = setup();
        const loaded = await fixture.call('GET');
        expect(loaded.status).toBe(200);
        fixture.context.project = 'other-project';
        fixture.matrixServices.mockClear();

        const result = await fixture.call('POST', { ...target, contextIdentity: loaded.body.contextIdentity });

        expect(result.status).toBe(409);
        expect(result.body.message).toMatch(/Kontext.*geändert/);
        expect(fixture.matrixServices).not.toHaveBeenCalled();
        expect(fixture.azure.writes).toEqual([]);
    });

    it('rejects writes without the identity returned by a matrix read', async () => {
        const fixture = setup();
        expect((await fixture.call('POST', target)).status).toBe(409);
        expect(fixture.azure.writes).toEqual([]);
    });

    it('keeps an explicitly configured set bound to its project when the global fallback changes', async () => {
        const fixture = setup();
        fixture.set.organization = fixture.context.organization;
        fixture.set.project = fixture.context.project;
        const loaded = await fixture.call('GET');
        fixture.context.project = 'other-project';

        const result = await fixture.call('POST', { ...target, contextIdentity: loaded.body.contextIdentity });

        expect(result.status).toBe(200);
        expect(result.body.runId).toBe(100);
        expect(fixture.matrixServices.mock.calls.at(-1)?.[0].project).toBe('contract-project');
    });

    it('uses one immutable context throughout a write when the global context changes during execution', async () => {
        const fixture = setup();
        const loaded = await fixture.call('GET');
        const services = fixture.matrixServices.mock.results[0].value;
        fixture.matrixServices.mockImplementation(context => {
            expect(Object.isFrozen(context)).toBe(true);
            fixture.context.project = 'other-project';
            expect(context.project).toBe('contract-project');
            return services;
        });
        fixture.resolveContext.mockClear();

        const result = await fixture.call('POST', { ...target, contextIdentity: loaded.body.contextIdentity });

        expect(result.status).toBe(200);
        expect(fixture.resolveContext).toHaveBeenCalledTimes(1);
        expect(fixture.matrixServices.mock.calls.at(-1)?.[0].project).toBe('contract-project');
    });
});
