import type { TestCaseHydrationPort } from "../../../application/ports/test-case-hydration.port.js";
import type { WorkItemHydrationPort } from "../../../application/ports/work-item-hydration.port.js";
import type { TestCaseHydrationData } from "../../../domain/test-management/test-case-hydration-data.js";

/**
 * Adapter that satisfies {@link TestCaseHydrationPort} by projecting work
 * items returned from a {@link WorkItemHydrationPort}.
 *
 * Acts as the anti-corruption layer between the Test Management bounded
 * context and the Work Items bounded context: the projection lives at the
 * adapter boundary, so the Test Management use case never imports a Work
 * Items domain entity.
 */
export class WorkItemBackedTestCaseHydrationAdapter implements TestCaseHydrationPort {
  public constructor(private readonly workItemHydration: WorkItemHydrationPort) {}

  public async hydrateTestCases(ids: number[]): Promise<Map<number, TestCaseHydrationData>> {
    const workItemsById = await this.workItemHydration.hydrateWorkItems(ids);
    const projected = new Map<number, TestCaseHydrationData>();
    for (const [id, item] of workItemsById) {
      projected.set(id, {
        title: item.title,
        state: item.state,
        workItemType: item.workItemType,
        assignedTo: item.assignedTo,
        tags: item.tags,
        areaPath: item.areaPath,
        priority: item.priority,
        relatedIds: item.relatedIds
      });
    }
    return projected;
  }
}
