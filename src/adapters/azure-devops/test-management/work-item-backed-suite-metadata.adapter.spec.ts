import { describe, expect, it, vi } from 'vitest';
import type { WorkItem } from '../../../domain/work-items/work-item.js';
import { WorkItemBackedSuiteMetadataAdapter } from './work-item-backed-suite-metadata.adapter.js';
const suite = (id: number, tags: string[] = []): WorkItem => ({ id, tags, title: 'Regression', workItemType: 'Test Suite', state: 'Ready', assignedTo: null, areaPath: null, priority: null, relatedIds: [] });
describe('concrete suite Work Item metadata', () => {
    it('hydrates unique suite IDs and preserves concrete full tags, including an empty list', async () => {
        const hydrateWorkItems = vi.fn(async () => new Map([[21, suite(21,[' 2.1.0-Test ','2.1.0-Pilot'])],[22,suite(22)]]));
        const result = await new WorkItemBackedSuiteMetadataAdapter({hydrateWorkItems}).loadSuiteTags([21,22,21]);
        expect(hydrateWorkItems).toHaveBeenCalledWith([21,22]);
        expect(result).toEqual(new Map([[21,[' 2.1.0-Test ','2.1.0-Pilot']],[22,[]]]));
    });
    it.each(['missing','wrong-type'])('rejects %s metadata instead of declaring an untagged suite', async scenario => {
        const item={...suite(21),workItemType:'Test Case'};
        const adapter=new WorkItemBackedSuiteMetadataAdapter({hydrateWorkItems:async()=>scenario==='missing'?new Map():new Map([[21,item]])});
        await expect(adapter.loadSuiteTags([21])).rejects.toThrow('Suite #21');
    });
    it('propagates transport failure with a suite-specific message', async () => {
        const adapter=new WorkItemBackedSuiteMetadataAdapter({hydrateWorkItems:async()=>{throw new Error('HYDRATION_HTTP_400');}});
        await expect(adapter.loadSuiteTags([21])).rejects.toThrow('Suite-Tags konnten nicht geladen werden');
    });
    it('skips the transport for an empty plan', async () => {
        const hydrateWorkItems=vi.fn();expect(await new WorkItemBackedSuiteMetadataAdapter({hydrateWorkItems}).loadSuiteTags([])).toEqual(new Map());
        expect(hydrateWorkItems).not.toHaveBeenCalled();
    });
});
