export type WorkItemSpacerToken = number | null;

export type VisibleWorkItemSpacerToken = {
  tokenIndex: number;
  workItemId: number | null;
};

export function normalizeWorkItemSpacerLayout(value: readonly unknown[]): WorkItemSpacerToken[] {
  const seen = new Set<number>();
  return value.flatMap((token) => {
    if (token === null) return [null];
    if (typeof token !== "number" || !Number.isInteger(token) || token <= 0 || seen.has(token)) return [];
    seen.add(token);
    return [token];
  });
}

export function migrateSpacerPositions(positions: Readonly<Record<number, number>>): WorkItemSpacerToken[] {
  const entries = Object.entries(positions)
    .map(([rawId, position]) => [Number(rawId), position] as const)
    .filter(([id, position]) => Number.isInteger(id) && id > 0 && Number.isInteger(position) && position >= 0)
    .sort(([leftId, leftPosition], [rightId, rightPosition]) => leftPosition - rightPosition || leftId - rightId);
  const layout: WorkItemSpacerToken[] = [];
  entries.forEach(([id, preferred]) => {
    let index = preferred;
    while (layout[index] !== undefined) index += 1;
    while (layout.length <= index) layout.push(null);
    layout[index] = id;
  });
  return layout;
}

export function positionsFromSpacerLayout(layout: readonly WorkItemSpacerToken[]): Record<number, number> {
  return Object.fromEntries(layout.flatMap((token, index) => token === null ? [] : [[token, index]]));
}

export function projectVisibleSpacerLayout(
  layout: readonly WorkItemSpacerToken[],
  visibleIds: ReadonlySet<number>
): VisibleWorkItemSpacerToken[] {
  return layout.flatMap((workItemId, tokenIndex) => workItemId === null || visibleIds.has(workItemId)
    ? [{ tokenIndex, workItemId }]
    : []);
}

export function moveWorkItemIntoSpacerSlot(
  layout: readonly WorkItemSpacerToken[],
  sourceWorkItemId: number,
  targetTokenIndex: number
): WorkItemSpacerToken[] {
  const sourceIndex = layout.indexOf(sourceWorkItemId);
  if (sourceIndex < 0 || layout[targetTokenIndex] !== null) return [...layout];
  const next = [...layout];
  next[sourceIndex] = null;
  next[targetTokenIndex] = sourceWorkItemId;
  return next;
}
