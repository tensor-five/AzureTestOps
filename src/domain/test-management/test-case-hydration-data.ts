/**
 * The slice of work-item-shaped data the Test Management aggregator consumes
 * to materialize a {@link TestCaseProjection}. Defined locally so this
 * bounded context stays decoupled from the Work Items domain — adapters /
 * use cases project upstream `WorkItem`s into this shape at the boundary.
 */
export type TestCaseHydrationData = {
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string | null;
  tags: string[];
  areaPath: string | null;
  priority: number | null;
  /** `System.LinkTypes.Related` target ids carried over from the source work item. */
  relatedIds: number[];
};
