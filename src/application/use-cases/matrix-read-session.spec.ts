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
    it('forwards the session signal into naked history ports and separates in-flight caller scopes', async () => {
        const { services } = matrixTestServices();
        const controller = new AbortController();
        let received!: AbortSignal;
        vi.spyOn(services.testManagement, 'listRunsForPlan').mockImplementation((_plan, signal) => new Promise((_resolve, reject) => {
            received = signal!;
            received.addEventListener('abort', () => reject(received.reason), { once: true });
        }));
        const session = createMatrixReadSession(services, { signal: controller.signal });
        const cancelled = session.testManagement.listRunsForPlan(1).catch(error => error);
        expect(received).toBe(controller.signal);
        controller.abort();
        expect(await cancelled).toMatchObject({ name: 'AbortError' });

        const first = new AbortController(), second = new AbortController();
        const reads: Array<{ signal: AbortSignal; resolve(value: never[]): void }> = [];
        vi.spyOn(services.testManagement, 'loadResultsForRun').mockImplementation((_run, signal) => new Promise((resolve, reject) => {
            reads.push({ signal: signal!, resolve });
            signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
        }));
        const independentSession = createMatrixReadSession(services);
        const left = independentSession.testManagement.loadResultsForRun(1, first.signal).catch(error => error);
        const right = independentSession.testManagement.loadResultsForRun(1, second.signal);
        expect(reads).toHaveLength(2);
        first.abort();
        expect(await left).toMatchObject({ name: 'AbortError' });
        expect(reads[1].signal.aborted).toBe(false);
        reads[1].resolve([]);
        expect(await right).toEqual([]);
        first.abort();
        expect(() => independentSession.testManagement.loadResultsForRun(1, first.signal)).toThrow();
    });
});
