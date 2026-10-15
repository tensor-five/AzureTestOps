export type ViewReadDiagnostics = ReturnType<typeof createViewReadDiagnostics>;
export type ReadOperationTiming = { calls: number; completed: number; failed: number; totalMs: number; maxMs: number };
type View = 'release-matrix' | 'relations';
type Side = 'browser' | 'server';

export function isViewReadRequestId(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Bounded summaries of numeric metadata only; payloads, URLs and errors never reach the sink. */
export function createViewReadDiagnostics(view: View, requestId: string, side: Side,
    sink: (entry: object) => void = entry => console.info(`[${view}.read]`, side === 'server' ? JSON.stringify(entry) : entry)) {
    const started = Date.now();
    const counts: Record<string, number> = {};
    const operations = new Map<string, ReadOperationTiming>();
    const phases = new Map<string, number>();
    const active = new Map<number, { operation: string; ids: Record<string, number>; started: number }>();
    let sequence = 0, failureCount = 0, finished = false;
    const elapsed = (since: number) => Math.max(0, Date.now() - since);
    const emit = (event: string, details: object = {}) => {
        if (finished) return;
        try { sink({ requestId, side, event, timestamp: new Date().toISOString(), elapsedMs: elapsed(started), ...details }); }
        catch { /* Diagnostics must never fail a read or trigger its retry policy. */ }
    };
    const timing = (operation: string) => {
        let value = operations.get(operation);
        if (!value) { value = { calls: 0, completed: 0, failed: 0, totalMs: 0, maxMs: 0 }; operations.set(operation, value); }
        return value;
    };
    const recordDuration = (value: ReadOperationTiming, since: number) => {
        const duration = elapsed(since);
        value.totalMs += duration;
        value.maxMs = Math.max(value.maxMs, duration);
    };
    const summaries = () => Object.fromEntries([...operations].map(([key, value]) => [key, { ...value }]));
    const addCount = (key: string, amount = 1) => { counts[key] = (counts[key] ?? 0) + amount; };
    emit('start');
    const timer = setInterval(() => emit('pending', { counts: { ...counts }, operations: summaries(), activeCount: active.size,
        active: [...active.values()].slice(0, 5).map(item => ({ operation: item.operation, ...item.ids, elapsedMs: elapsed(item.started) })) }), 10_000);
    return {
        addCount,
        progress(values: Record<string, number>) { Object.assign(counts, values); emit('progress', { counts: { ...counts } }); },
        phase(name: string, complete: boolean) {
            if (finished) return;
            const key = `phase.${name}`;
            if (!complete && !phases.has(key)) { phases.set(key, Date.now()); timing(key).calls++; }
            const since = phases.get(key);
            if (complete && since !== undefined) {
                phases.delete(key);
                const value = timing(key);
                value.completed++;
                recordDuration(value, since);
            }
        },
        httpResponse(status: number, ids: Record<string, number>, retryAfterMs?: number) {
            const key = `httpStatus${status}`;
            addCount(key);
            if (status >= 300 && counts[key] <= 5) emit('http-response', { status, ...ids,
                ...(retryAfterMs !== undefined && Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}) });
        },
        httpRetry(ids: Record<string, number>, waitMs: number) {
            addCount('httpRetries');
            addCount('httpRetryWaitMs', Math.max(0, waitMs));
            if (counts.httpRetries <= 5) emit('http-retry', { ...ids, waitMs: Math.max(0, waitMs) });
        },
        async measure<T>(operation: string, ids: Record<string, number>, work: () => Promise<T>, group = operation): Promise<T> {
            if (finished) return work();
            const id = ++sequence, since = Date.now(), value = timing(group);
            value.calls++;
            addCount(`${operation}Started`);
            active.set(id, { operation: group, ids, started: since });
            if (operation === 'http') counts.httpMaxInFlight = Math.max(counts.httpMaxInFlight ?? 0,
                [...active.values()].filter(item => item.operation.startsWith('http.')).length);
            try {
                const result = await work();
                value.completed++;
                addCount(`${operation}Completed`);
                const itemCount = Array.isArray(result) ? result.length : result instanceof Map ? result.size : null;
                if (itemCount !== null) addCount(`${operation}Items`, itemCount);
                return result;
            } catch (error) {
                value.failed++;
                counts.failedOperations = ++failureCount;
                if (failureCount <= 5) emit('operation-error', { operation: group, ...ids,
                    category: error instanceof Error && error.name === 'AbortError' ? 'aborted' : 'failed' });
                throw error;
            } finally { recordDuration(value, since); active.delete(id); }
        },
        finish(outcome: 'complete' | 'error' | 'aborted') {
            if (finished) return;
            clearInterval(timer);
            emit(outcome, { counts: { ...counts }, operations: summaries(), activeCount: active.size });
            finished = true;
        },
    };
}
