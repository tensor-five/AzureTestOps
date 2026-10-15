import type { PlanTestResults, TestResultHistoryPort, TestResultHistoryReadOptions } from '../../../application/ports/test-result-history.port.js';
import type { TestResult } from '../../../domain/test-management/test-result.js';
import type { TestRun } from '../../../domain/test-management/test-run.js';
import type { ViewReadDiagnostics } from '../../../shared/diagnostics/view-read-diagnostics.js';
import { mapConcurrent } from '../../../shared/utils/concurrency.js';

type ContextState = { epoch: number };
type Entry = { contextKey: string; planId: number; runId: number; marker: string; readAt: number; results: TestResult[] };
type CacheOptions = { now?: () => number; maxAgeMs?: number; maxEntries?: number; maxResults?: number; maxContexts?: number };

/** Bounded runtime-only cache. Completed history is always revalidated against a fresh run list. */
export class InMemoryTestResultHistoryAdapter {
  private readonly entries = new Map<string, Entry>();
  private readonly contexts = new Map<string, ContextState>();
  /** Active operations only; unlike cached contexts, their write fence survives LRU eviction. */
  private readonly activeWrites = new Map<string, number>();
  private resultCount = 0;
  private readonly now: () => number;
  private readonly maxAgeMs: number;
  private readonly maxEntries: number;
  private readonly maxResults: number;
  private readonly maxContexts: number;

  public constructor(options: CacheOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxAgeMs = Math.min(60_000, Math.max(0, options.maxAgeMs ?? 60_000));
    this.maxEntries = Math.max(0, options.maxEntries ?? 5_000);
    this.maxResults = Math.max(0, options.maxResults ?? 100_000);
    this.maxContexts = Math.max(1, options.maxContexts ?? 8);
  }

  public forContext(contextKey: string, diagnostics?: ViewReadDiagnostics): TestResultHistoryPort {
    return { loadPlanResults: (planId, options) => this.load(contextKey, planId, options, diagnostics) };
  }

  /** Invalidates before and after any write attempt, including uncertain/failed writes. */
  public beginWrite(contextKey: string, planId?: number): () => void {
    const state = this.context(contextKey);
    state.epoch++;
    this.activeWrites.set(contextKey, (this.activeWrites.get(contextKey) ?? 0) + 1);
    this.invalidate(contextKey, planId);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      state.epoch++;
      const currentState = this.contexts.get(contextKey);
      if (currentState && currentState !== state) currentState.epoch++;
      const remaining = (this.activeWrites.get(contextKey) ?? 1) - 1;
      if (remaining > 0) this.activeWrites.set(contextKey, remaining);
      else this.activeWrites.delete(contextKey);
      this.invalidate(contextKey, planId);
    };
  }

  private async load(contextKey: string, planId: number, options: TestResultHistoryReadOptions,
    diagnostics?: ViewReadDiagnostics): Promise<PlanTestResults> {
    options.signal?.throwIfAborted();
    const startedAt = this.now();
    this.prune(startedAt);
    const state = this.context(contextKey), epoch = state.epoch;
    // The port supplied by the current request retains its own cancellation and diagnostics.
    // Only completed values are shared; one consumer can never abort another consumer's HTTP call.
    const runs = await options.testManagement.listRunsForPlan(planId, options.signal);
    options.signal?.throwIfAborted();
    let oldestReadAt = startedAt, cacheUsed = false, reused = 0, fetched = 0;
    const staged: Entry[] = [];
    const results = await mapConcurrent(runs, options.concurrency ?? 8, async run => {
      const key = entryKey(contextKey, planId, run.runId), marker = runMarker(run);
      const previous = this.entries.get(key);
      const current = this.now();
      if (!this.activeWrites.has(contextKey) && this.contexts.get(contextKey) === state && state.epoch === epoch
        && run.planId === planId && run.state === 'Completed' && previous?.marker === marker
        && this.isFresh(previous, current)) {
        // LRU access changes eviction order, never source age or expiry.
        this.entries.delete(key);
        this.entries.set(key, previous);
        oldestReadAt = Math.min(oldestReadAt, previous.readAt);
        cacheUsed = true;
        reused++;
        return previous.results.map(result => ({ ...result }));
      }
      fetched++;
      const readAt = this.now();
      const values = await options.testManagement.loadResultsForRun(run.runId, options.signal);
      options.signal?.throwIfAborted();
      oldestReadAt = Math.min(oldestReadAt, readAt);
      // Incomplete histories remain usable by the existing aggregator, but never become reusable cache data.
      if (run.planId === planId && run.state === 'Completed' && values.length >= run.totalTests
        && values.every(result => result.runId === run.runId && (result.state === undefined || result.state === 'Completed')))
        staged.push({ contextKey, planId, runId: run.runId, marker, readAt, results: values.map(result => ({ ...result })) });
      return values;
    }, options.signal);
    options.signal?.throwIfAborted();
    // Commit atomically only after the complete history succeeded. Invalidation fences older in-flight readers.
    if (this.contexts.get(contextKey) === state && state.epoch === epoch && !this.activeWrites.has(contextKey)) {
      const currentRunIds = new Set(runs.map(run => run.runId));
      for (const [key, entry] of this.entries)
        if (entry.contextKey === contextKey && entry.planId === planId && !currentRunIds.has(entry.runId)) this.remove(key);
      for (const entry of staged) this.store(entry);
    }
    diagnostics?.addCount('historyRunsReused', reused);
    diagnostics?.addCount('historyRunsFetched', fetched);
    return { runs, results: results.flat(), freshness: { sourceReadAt: new Date(oldestReadAt).toISOString(), cacheUsed } };
  }

  private context(key: string): ContextState {
    const state = this.contexts.get(key) ?? { epoch: 0 };
    this.contexts.delete(key);
    this.contexts.set(key, state);
    while (this.contexts.size > this.maxContexts) {
      const oldest = this.contexts.keys().next().value!;
      this.contexts.delete(oldest);
      this.invalidate(oldest);
    }
    return state;
  }

  private isFresh(entry: Entry, now: number): boolean { return now >= entry.readAt && now - entry.readAt < this.maxAgeMs; }
  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (!this.isFresh(entry, now)) this.remove(key);
  }
  private invalidate(contextKey: string, planId?: number): void {
    for (const [key, entry] of this.entries)
      if (entry.contextKey === contextKey && (planId === undefined || entry.planId === planId)) this.remove(key);
  }
  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) { this.resultCount -= entry.results.length; this.entries.delete(key); }
  }
  private store(entry: Entry): void {
    if (entry.results.length > this.maxResults || !this.isFresh(entry, this.now()) || this.maxEntries === 0) return;
    const key = entryKey(entry.contextKey, entry.planId, entry.runId);
    this.remove(key);
    this.entries.set(key, entry);
    this.resultCount += entry.results.length;
    while (this.entries.size > this.maxEntries || this.resultCount > this.maxResults) this.remove(this.entries.keys().next().value!);
  }
}

function entryKey(contextKey: string, planId: number, runId: number): string { return JSON.stringify([contextKey, planId, runId]); }
function runMarker(run: TestRun): string {
  return JSON.stringify([run.state, run.revision, run.lastUpdatedDate, run.startedDate, run.completedDate, run.totalTests, run.passedTests, run.isAutomated]);
}
