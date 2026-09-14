import { describe, expect, it, vi } from 'vitest';
import { recordMatrixOutcome } from './record-matrix-outcome.use-case.js';
import { matrixTestServices } from '../../../tests/fixtures/release-matrix.js';
import type { MatrixOutcomeTarget } from '../dto/release-matrix.dto.js';

// The approved v4 contract retains v3 manual-write semantics. Diagnostics were
// explicitly requested for debugging; they must not change those semantics.
type DiagnosticEvent = {
  stage: string;
  event: 'start' | 'complete' | 'error';
  fields: Record<string, unknown>;
};
const target: MatrixOutcomeTarget = {
  planId: 1, suiteId: 21, workItemId: 201, pointId: 21201, outcome: 'NotApplicable',
};
const stages = ['validate-target', 'create-run', 'find-result', 'complete-result', 'complete-run', 'confirm-run', 'confirm-projection'];
const unconfirmed = 'Durchlauf 100 wurde angelegt, Ergebnis nicht bestätigt. Bitte diesen Durchlauf in Azure prüfen; es wird nicht automatisch erneut gespeichert.';

function setup() {
  const fixture = matrixTestServices();
  const events: DiagnosticEvent[] = [];
  const event = vi.fn((entry: DiagnosticEvent) => { events.push(entry); });
  // Pass a structurally extended variable so tests boot against the pre-logging
  // implementation, failing by assertion rather than missing imports/types.
  return { ...fixture, events, event, deps: { ...fixture.services, diagnostics: { event } } };
}

function expectSafeEvents(events: DiagnosticEvent[]) {
  const numericFields = new Set(['planId', 'suiteId', 'workItemId', 'pointId', 'runId', 'resultId', 'caseCount', 'pointCount', 'resultCount', 'matchingResultCount', 'runCount', 'projectionCount', 'lastRunId', 'lastResultId', 'testPointId', 'httpStatus']);
  const booleanFields = new Set(['caseFound', 'runFound', 'projectionFound', 'pointMatches', 'outcomeMatches', 'runMatches', 'resultMatches']);
  const outcomeValues = new Set(['Passed', 'Failed', 'Blocked', 'NotApplicable', 'Inconclusive', 'Unspecified', 'NotRun', 'Paused', 'Unknown']);
  const stateValues = new Set(['Unspecified', 'NotStarted', 'InProgress', 'Waiting', 'Completed', 'Aborted', 'NeedsInvestigation', 'Unknown']);
  expect(events.length).toBeGreaterThan(0);
  for (const entry of events) {
    expect(Object.keys(entry).sort()).toEqual(['event', 'fields', 'stage']);
    expect(stages).toContain(entry.stage);
    expect(['start', 'complete', 'error']).toContain(entry.event);
    for (const [key, value] of Object.entries(entry.fields)) {
      if (numericFields.has(key)) {
        expect(value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)).toBe(true);
      } else if (booleanFields.has(key)) {
        expect(typeof value).toBe('boolean');
      } else if (key === 'outcome' || key === 'lastOutcome') {
        expect(outcomeValues.has(value as string)).toBe(true);
      } else if (key === 'runState') {
        expect(stateValues.has(value as string)).toBe(true);
      } else {
        expect.fail(`Unapproved diagnostics field: ${key}`);
      }
    }
  }
}

describe('Manual matrix outcome diagnostics', () => {
  it('reports each successful NotApplicable write stage without changing the physical write', async () => {
    const { deps, events, azure } = setup();
    const saved = await recordMatrixOutcome(target, deps);

    expect(events.map(({ stage, event }) => `${stage}:${event}`)).toEqual(
      stages.flatMap(stage => [`${stage}:start`, `${stage}:complete`]),
    );
    expect(saved).toMatchObject({ runId: 100, projection: { lastOutcome: 'NotApplicable', lastRunId: 100, lastResultId: 1000, testPointId: 21201 } });
    expect(azure.writes.map(write => write.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    expect(azure.results.find(result => result.testRun.id === 100)).toMatchObject({ outcome: 'NotApplicable', state: 'Completed' });
    expectSafeEvents(events);
  });

  it('identifies an missing targeted run confirmation after both PATCHes completed without retrying', async () => {
    const { deps, events, azure } = setup();
    vi.spyOn(deps.outcomeRead, 'loadRun').mockResolvedValue(null);

    await expect(recordMatrixOutcome(target, deps)).rejects.toThrow(unconfirmed);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'complete-result', event: 'complete' }),
      expect.objectContaining({ stage: 'complete-run', event: 'complete' }),
      expect.objectContaining({ stage: 'confirm-run', event: 'error', fields: expect.objectContaining({ runId: 100, runCount: 0, runFound: false }) }),
    ]));
    expect(events.at(-1)).toMatchObject({ stage: 'confirm-run', event: 'error' });
    expect(azure.writes.map(write => write.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    expect(azure.runs.at(-1)).toMatchObject({ id: 100, state: 'Completed' });
    expectSafeEvents(events);
  });

  it('identifies an empty newly created result list and sends no PATCH', async () => {
    const { deps, events, azure } = setup();
    vi.spyOn(deps.outcomeRead, 'loadResultsForRun').mockResolvedValue([]);

    await expect(recordMatrixOutcome(target, deps)).rejects.toThrow(unconfirmed);
    expect(events.at(-1)).toMatchObject({ stage: 'find-result', event: 'error', fields: { runId: 100, resultCount: 0, matchingResultCount: 0 } });
    expect(azure.writes.map(write => write.method)).toEqual(['POST']);
    expectSafeEvents(events);
  });

  it('reports the failed result PATCH stage without recording its raw error, URL or stack', async () => {
    const { deps, events, azure } = setup();
    const rawError = 'private-test-token https://private.invalid/sensitive-path user@example.invalid';
    const patch = vi.spyOn(deps.execution, 'completeResult').mockRejectedValue(new Error(rawError));

    await expect(recordMatrixOutcome(target, deps)).rejects.toThrow(unconfirmed);
    expect(events.at(-1)).toMatchObject({ stage: 'complete-result', event: 'error', fields: { runId: 100, resultId: 1000, outcome: 'NotApplicable' } });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(azure.writes.map(write => write.method)).toEqual(['POST']);
    expect(JSON.stringify(events)).not.toContain(rawError);
    expectSafeEvents(events);
  });

  it('does not leak unknown Azure state strings into diagnostics', async () => {
    const { deps, events } = setup();
    const loadRun = deps.outcomeRead.loadRun.bind(deps.outcomeRead);
    const rawState = 'private-state https://private.invalid';
    vi.spyOn(deps.outcomeRead, 'loadRun').mockImplementation(async runId => ({ ...(await loadRun(runId))!, state: rawState }));

    await expect(recordMatrixOutcome(target, deps)).rejects.toThrow(unconfirmed);
    expect(events.at(-1)).toMatchObject({ stage: 'confirm-run', event: 'error' });
    expect(JSON.stringify(events)).not.toContain(rawState);
    expectSafeEvents(events);
  });

  it('reports the HTTP status from the known adapter failure without logging the error message', async () => {
    const { deps, events, azure } = setup();
    const adapterMessage = 'Azure konnte den Testlauf nicht speichern (HTTP 400).';
    vi.spyOn(deps.execution, 'completeResult').mockRejectedValue(new Error(adapterMessage));

    await expect(recordMatrixOutcome(target, deps)).rejects.toThrow(unconfirmed);
    expect(events.at(-1)).toMatchObject({ stage: 'complete-result', event: 'error', fields: { runId: 100, resultId: 1000, outcome: 'NotApplicable', httpStatus: 400 } });
    expect(JSON.stringify(events)).not.toContain(adapterMessage);
    expect(azure.writes.map(write => write.method)).toEqual(['POST']);
    expectSafeEvents(events);
  });

  it.each([
    'Azure konnte den Testlauf nicht speichern (HTTP 400). private-test-token https://private.invalid',
    'Azure konnte den Testlauf nicht speichern (HTTP 999).',
  ])('does not extract a status from an unrecognized or invalid error message', async rawError => {
    const { deps, events } = setup();
    vi.spyOn(deps.execution, 'completeResult').mockRejectedValue(new Error(rawError));

    await expect(recordMatrixOutcome(target, deps)).rejects.toThrow(unconfirmed);
    expect(events.at(-1)).toMatchObject({ stage: 'complete-result', event: 'error' });
    expect(events.at(-1)?.fields).not.toHaveProperty('httpStatus');
    expect(JSON.stringify(events)).not.toContain(rawError);
    expectSafeEvents(events);
  });

  it('keeps a successful Azure write successful when the diagnostics sink throws', async () => {
    const { deps, event, azure } = setup();
    event.mockImplementation(() => { throw new Error('Logging sink unavailable'); });

    await expect(recordMatrixOutcome(target, deps)).resolves.toMatchObject({ runId: 100, projection: { lastOutcome: 'NotApplicable' } });
    expect(event).toHaveBeenCalled();
    expect(azure.writes.map(write => write.method)).toEqual(['POST', 'PATCH', 'PATCH']);
  });
});
