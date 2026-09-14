import type { AzureHttpResponse, AzureRestHttpClient } from './azure-rest-client.js';

/** Per-write measurements. Never caches/retries calls or records URLs, bodies, headers or errors. */
export class MatrixWriteHttpMetrics {
  private readonly started: number;
  private requests = 0;
  private reads = 0;
  private active = 0;
  private peak = 0;
  private failures = 0;
  private httpMs = 0;
  private readonly operations: Record<string, number> = {};
  constructor(private readonly now: () => number = () => performance.now()) { this.started = now(); }
  wrap(client: AzureRestHttpClient): AzureRestHttpClient {
    return {
      get: (url, options) => this.measure('GET', url, () => client.get(url, options)),
      ...(client.post ? { post: (url: string, body: unknown) => this.measure('POST', url, () => client.post!(url, body)) } : {}),
      ...(client.patch ? { patch: (url: string, body: unknown, headers?: Record<string, string>) => this.measure('PATCH', url, () => client.patch!(url, body, headers)) } : {}),
    };
  }
  snapshot() {
    return { elapsedMs: Math.round(this.now() - this.started), requestCount: this.requests, readCount: this.reads,
      writeCount: this.requests - this.reads, failedRequests: this.failures, activeCount: this.active,
      maxConcurrent: this.peak, httpElapsedMs: Math.round(this.httpMs), operations: { ...this.operations } };
  }
  private async measure(method: string, url: string, work: () => Promise<AzureHttpResponse>): Promise<AzureHttpResponse> {
    const start = this.now();
    this.requests++; if (method === 'GET') this.reads++;
    this.active++; this.peak = Math.max(this.peak, this.active);
    const operation = `${method}:${classify(url)}`;
    this.operations[operation] = (this.operations[operation] ?? 0) + 1;
    try {
      const result = await work();
      if (result.status >= 400) this.failures++;
      return result;
    } catch (error) { this.failures++; throw error; }
    finally { this.active--; this.httpMs += this.now() - start; }
  }
}
function classify(url: string): string {
  // Only fixed labels leave this boundary, even for unknown or malformed URLs.
  const path = url.split('?')[0];
  if (/\/testcases\/\d+$/i.test(path)) return 'case-membership';
  if (/\/points\/\d+$/i.test(path)) return 'point';
  if (/\/points$/i.test(path)) return 'case-points';
  if (/\/runs\/\d+\/results\/\d+$/i.test(path)) return 'result';
  if (/\/runs\/\d+\/results$/i.test(path)) return 'run-results';
  if (/\/runs\/\d+$/i.test(path)) return 'run';
  if (/\/runs$/i.test(path)) return 'runs';
  return 'other';
}
