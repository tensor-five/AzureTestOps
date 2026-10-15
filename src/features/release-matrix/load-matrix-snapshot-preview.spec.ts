import { expect, it, vi } from 'vitest';
import { loadMatrixSnapshotPreview } from './load-matrix-snapshot-preview.js';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';

const snapshot: MatrixSnapshot = {planId:1, contextIdentity:'org/project', suites:[], projections:[], pointCounts:{}, loadedAt:'2026-10-15T07:00:00Z'};
const request = () => ({setId:'release', planId:1, contextIdentity:'org/project', versionSuiteIds:[20], flatVersionSuiteIds:[], signal:new AbortController().signal});
const port = () => ({load:vi.fn(), record:vi.fn(), loadCached:vi.fn(async () => snapshot)});

it('accepts a preview for the captured scope without reading live data', async () => {
  const client = port();
  expect(await loadMatrixSnapshotPreview(client, request())).toBe(snapshot);
  expect(client.load).not.toHaveBeenCalled();
});
it.each([{planId:2}, {contextIdentity:'another/project'}, {loadedAt:undefined}])('rejects foreign or undated previews: %j', async patch => {
  const client = port();
  client.loadCached.mockResolvedValue({...snapshot, ...patch});
  expect(await loadMatrixSnapshotPreview(client, request())).toBeNull();
});
it('tolerates unsupported previews, errors and cancellation', async () => {
  expect(await loadMatrixSnapshotPreview({load:vi.fn(),record:vi.fn()},request())).toBeNull();
  const client = port();
  client.loadCached.mockRejectedValueOnce(new Error('Preview unavailable'));
  expect(await loadMatrixSnapshotPreview(client,request())).toBeNull();
  const controller = new AbortController();
  client.loadCached.mockImplementationOnce(async () => {controller.abort();return snapshot;});
  expect(await loadMatrixSnapshotPreview(client,{...request(),signal:controller.signal})).toBeNull();
});
