import type { TestCaseTagsPort } from '../../../application/ports/test-case-tags.port.js';
import { buildAdoBaseUrl, type AdoOrgProjectContext, type AzureRestHttpClient } from '../../../shared/azure-devops/azure-rest-client.js';
import { mapConcurrent } from '../../../shared/utils/concurrency.js';
import { requestWithRetry } from '../../../shared/utils/retry.js';

export class AzureTestCaseTagsAdapter implements TestCaseTagsPort {
  private readonly base: string;
  constructor(private readonly client: AzureRestHttpClient, context: AdoOrgProjectContext) { this.base = buildAdoBaseUrl(context); }
  async loadTags(workItemIds: readonly number[]): Promise<Map<number, string[]>> {
    const ids = [...new Set(workItemIds)];
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const loaded = await mapConcurrent(chunks, 4, async chunk => {
      const url = `${this.base}/_apis/wit/workitems?ids=${chunk.join(',')}&fields=System.Tags,System.WorkItemType&api-version=7.1`;
      const { response } = await requestWithRetry(() => this.client.get(url), { signal: this.client.signal });
      if (response.status !== 200) throw new Error(`TAGS_HTTP_${response.status}`);
      const value = (response.json as { value?: unknown })?.value;
      if (!Array.isArray(value)) throw new Error('Ungültiger Tagkatalog von Azure.');
      const result = new Map<number, string[]>();
      for (const item of value) {
        const raw = item as { id?: unknown; fields?: Record<string, unknown> };
        const id = Number(raw.id), fields = raw.fields ?? {};
        if (!chunk.includes(id) || fields['System.WorkItemType'] !== 'Test Case') continue;
        const tags = fields['System.Tags'];
        result.set(id, typeof tags === 'string' ? tags.split(';').map(tag => tag.trim()).filter(Boolean) : []);
      }
      if (result.size !== chunk.length) throw new Error('Tagkatalog unvollständig: Testfälle konnten nicht gelesen werden.');
      return result;
    }, this.client.signal);
    return new Map(loaded.flatMap(values => [...values]));
  }
}
