import { describe, it, expect, vi } from 'vitest';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import { createMatrixReadSession } from './matrix-read-session.js';
describe('matrix read session', () => {
    it('shares concurrent identical reads, but never across requests', async () => {
        const { services } = matrixTestServices();
        const runs = vi.spyOn(services.testManagement, 'listRunsForPlan');
        const first = createMatrixReadSession(services);
        const [a, b] = await Promise.all([first.testManagement.listRunsForPlan(1), first.testManagement.listRunsForPlan(1)]);
        expect(a).toEqual(b); expect(runs).toHaveBeenCalledTimes(1);
        await createMatrixReadSession(services).testManagement.listRunsForPlan(1);
        expect(runs).toHaveBeenCalledTimes(2);
    });
    it('normalizes identical hydration batches and stops queued reads after abort', async () => {
        const { services } = matrixTestServices();
        const hydrate = vi.spyOn(services.testCaseHydration, 'hydrateTestCases');
        const controller = new AbortController();
        const session = createMatrixReadSession(services, { signal: controller.signal });
        await session.testCaseHydration.hydrateTestCases([101, 201, 101]);
        await session.testCaseHydration.hydrateTestCases([201, 101]);
        expect(hydrate).toHaveBeenCalledTimes(1);
        controller.abort();
        expect(() => session.testManagement.listRunsForPlan(1)).toThrow();
    });
});
