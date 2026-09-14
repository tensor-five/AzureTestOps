/** Deliberately accepts only operation names, numeric IDs and counters, never Azure payloads. */
export type MatrixReadDiagnostics = ReturnType<typeof createMatrixReadDiagnostics>;
export function createMatrixReadDiagnostics(requestId: string, side: 'browser' | 'server', sink: (entry: object) => void = entry => console.info('[release-matrix.read]', entry)) {
    const started = Date.now();
    const counts: Record<string, number> = {};
    const active = new Map<number, { operation: string; ids: Record<string, number>; started: number }>();
    let sequence = 0, failureCount = 0, finished = false;
    const emit = (event: string, details: object = {}) => { if (!finished) sink({ requestId, side, event, elapsedMs: Date.now() - started, ...details }); };
    const progress = (values: Record<string, number>) => { Object.assign(counts, values); emit('progress', { counts: { ...counts } }); };
    emit('start');
    const timer = setInterval(() => emit('pending', { counts: { ...counts }, activeCount: active.size,
        active: [...active.values()].slice(0, 5).map(item => ({ operation: item.operation, ...item.ids, elapsedMs: Date.now() - item.started })) }), 10_000);
    return {
        progress,
        httpResponse(status: number, ids: Record<string, number>, retryAfterMs?: number) {
            const key = `httpStatus${status}`;
            counts[key] = (counts[key] ?? 0) + 1;
            if (status >= 300 && counts[key] <= 5) emit('http-response', { status, ...ids,
                ...(retryAfterMs !== undefined && Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}) });
        },
        async measure<T>(operation: string, ids: Record<string, number>, work: () => Promise<T>): Promise<T> {
            const id = ++sequence;
            counts[`${operation}Started`] = (counts[`${operation}Started`] ?? 0) + 1;
            active.set(id, { operation, ids, started: Date.now() });
            try {
                const value = await work();
                counts[`${operation}Completed`] = (counts[`${operation}Completed`] ?? 0) + 1;
                const itemCount = Array.isArray(value) ? value.length : value instanceof Map ? value.size : null;
                if (itemCount !== null) counts[`${operation}Items`] = (counts[`${operation}Items`] ?? 0) + itemCount;
                return value;
            }
            catch (error) { failureCount++; counts.failedOperations = failureCount; if (failureCount <= 5) emit('operation-error', { operation, ...ids, category: error instanceof Error && error.name === 'AbortError' ? 'aborted' : 'failed' }); throw error; }
            finally { active.delete(id); }
        },
        finish(outcome: 'complete' | 'error' | 'aborted') {
            if (finished) return;
            clearInterval(timer); emit(outcome, { counts: { ...counts }, activeCount: active.size }); finished = true;
        },
    };
}
