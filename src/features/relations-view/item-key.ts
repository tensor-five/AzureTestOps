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

export type ParsedItemKey =
  | { kind: "test-case"; workItemId: number; suiteId: number }
  | { kind: "work-item"; workItemId: number };

const TEST_CASE_KEY_PATTERN = /^tc:(\d+):(\d+)$/;
const WORK_ITEM_KEY_PATTERN = /^wi:(\d+)$/;

/**
 * Reverses the encoding of {@link testCaseItemKey} / {@link workItemItemKey}.
 * Used by the line layer to resolve a raw `data-item-key` (read from the DOM
 * during a drop or selection event) back to the work-item / suite ids needed
 * by the relation mutation hook.
 */
export function parseItemKey(key: string): ParsedItemKey | null {
  const tcMatch = TEST_CASE_KEY_PATTERN.exec(key);
  if (tcMatch) {
    return {
      kind: "test-case",
      workItemId: Number.parseInt(tcMatch[1], 10),
      suiteId: Number.parseInt(tcMatch[2], 10)
    };
  }
  const wiMatch = WORK_ITEM_KEY_PATTERN.exec(key);
  if (wiMatch) {
    return { kind: "work-item", workItemId: Number.parseInt(wiMatch[1], 10) };
  }
  return null;
}
