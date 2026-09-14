/** Tag-only hydration for test cases, independent of execution and outcome data. */
export interface TestCaseTagsPort {
  loadTags(workItemIds: readonly number[]): Promise<Map<number, string[]>>;
}
