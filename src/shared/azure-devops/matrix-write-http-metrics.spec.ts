import { expect, it, vi } from 'vitest';
import { MatrixWriteHttpMetrics } from './matrix-write-http-metrics.js';

it('counts each actual uncached read and write, preserves concurrency and forwards arguments', async () => {
  let time = 0;
  const metrics = new MatrixWriteHttpMetrics(() => time);
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  const raw = { get: vi.fn(async () => { await wait; return {status: 200, json: {}}; }),
    patch: vi.fn(async () => ({status: 200, json: {}})) };
  const client = metrics.wrap(raw), signal = new AbortController().signal;
  const url = 'https://private.invalid/_apis/test/plans/1/suites/21/points?testCaseId=201';
  const reads = [client.get(url, {signal}), client.get(url, {signal})];
  expect(raw.get).toHaveBeenCalledTimes(2);
  expect(raw.get).toHaveBeenCalledWith(url, {signal});
  time = 12; finish(); await Promise.all(reads);
  const body = {resetToActive: true}, headers = {authorization: 'private-header'};
  await client.patch!(url, body, headers);
  expect(raw.patch).toHaveBeenCalledWith(url, body, headers);
  expect(metrics.snapshot()).toMatchObject({requestCount: 3, readCount: 2, writeCount: 1,
    activeCount: 0, maxConcurrent: 2, elapsedMs: 12, httpElapsedMs: 24, failedRequests: 0});
  expect(JSON.stringify(metrics.snapshot())).not.toContain('private');
});
it('does not retry ambiguous writes and records neither secrets nor raw errors', async () => {
  const metrics = new MatrixWriteHttpMetrics();
  const error = new Error('private-body-token');
  const raw = { get: vi.fn(async () => ({status: 503, json: 'private-response'})), post: vi.fn(async () => { throw error; }) };
  const client = metrics.wrap(raw);
  await expect(client.post!('private-url', 'private-payload')).rejects.toBe(error);
  await client.get('private-url');
  expect(raw.post).toHaveBeenCalledTimes(1);
  expect(metrics.snapshot()).toMatchObject({requestCount: 2, writeCount: 1, failedRequests: 2, activeCount: 0});
  expect(JSON.stringify(metrics.snapshot())).not.toContain('private');
  expect(client.patch).toBeUndefined();
});
