import type { TestSuiteMetadataPort } from '../../../application/ports/test-suite-metadata.port.js';
import type { WorkItemHydrationPort } from '../../../application/ports/work-item-hydration.port.js';

/** Reuses the normal WIT batching/transport; a partial response cannot mean an untagged suite. */
export class WorkItemBackedSuiteMetadataAdapter implements TestSuiteMetadataPort {
    constructor(private readonly hydration: WorkItemHydrationPort) {}
    async loadSuiteTags(suiteIds: number[]): Promise<Map<number, string[]>> {
        const ids = [...new Set(suiteIds)];
        if (!ids.length) return new Map();
        const items = await this.hydration.hydrateWorkItems(ids).catch(error => {
            throw new Error('Suite-Tags konnten nicht geladen werden. Bitte den Azure-Zugriff prüfen.', { cause: error });
        });
        const tags = new Map<number, string[]>();
        for (const id of ids) {
            const item = items.get(id);
            if (!item || item.workItemType !== 'Test Suite')
                throw new Error(`Suite-Tags konnten nicht vollständig geladen werden: Suite #${id} fehlt oder ist kein Test-Suite-Work-Item.`);
            tags.set(id, item.tags);
        }
        return tags;
    }
}
