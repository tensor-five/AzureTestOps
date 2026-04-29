/**
 * Stable string keys for items rendered in the RelationsView. The same Test
 * Case can live in multiple suites, so the test-case key carries `suiteId` to
 * keep entries distinct in `setLayouts[setId].positions`.
 */
export function testCaseItemKey(workItemId: number, suiteId: number): string {
  return `tc:${workItemId}:${suiteId}`;
}

export function workItemItemKey(workItemId: number): string {
  return `wi:${workItemId}`;
}
