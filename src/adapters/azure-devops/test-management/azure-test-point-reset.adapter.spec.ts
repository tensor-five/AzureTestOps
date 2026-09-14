import { describe, expect, it, vi } from 'vitest';
import { AzureTestPointResetAdapter } from './azure-test-point-reset.adapter.js';

describe('Azure test point reset', () => {
  it('patches only the specified physical point with resetToActive, without creating a run', async () => {
    const patch = vi.fn(async () => ({ status: 200, json: {} })), post = vi.fn(), get = vi.fn();
    await new AzureTestPointResetAdapter({ get, post, patch }, { organization: 'org', project: 'Test Project' }).resetToActive(1, 21, 21201);
    expect(patch).toHaveBeenCalledExactlyOnceWith('https://dev.azure.com/org/Test%20Project/_apis/test/Plans/1/Suites/21/points/21201?api-version=7.1',
      { resetToActive: true }, { 'content-type': 'application/json' });
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it.each([400, 429, 503])('does not retry an unconfirmed HTTP %s reset', async status => {
    const patch = vi.fn(async () => ({ status, json: {} }));
    await expect(new AzureTestPointResetAdapter({ get: vi.fn(), patch }, { organization: 'org', project: 'project' }).resetToActive(1, 21, 21201)).rejects.toThrow(`POINT_RESET_HTTP_${status}`);
    expect(patch).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable write access before transport', async () => {
    await expect(new AzureTestPointResetAdapter({ get: vi.fn() }, { organization: 'org', project: 'project' }).resetToActive(1, 21, 21201)).rejects.toThrow('nicht verfügbar');
  });
  it('does not retry a transport failure', async () => {
    const patch = vi.fn(async () => { throw new Error('connection lost'); });
    await expect(new AzureTestPointResetAdapter({ get: vi.fn(), patch }, { organization: 'org', project: 'project' }).resetToActive(1, 21, 21201)).rejects.toThrow('connection lost');
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
