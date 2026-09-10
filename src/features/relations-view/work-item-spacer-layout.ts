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
  const complete = completeWorkItemSpacerLayout(layout, [...visibleIds]);
  return complete.flatMap((workItemId, tokenIndex) => workItemId === null || visibleIds.has(workItemId)
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

/** Append new or unfiltered Bugs once, preserving existing token indexes. */
export function completeWorkItemSpacerLayout(layout: readonly WorkItemSpacerToken[], ids: readonly number[]): WorkItemSpacerToken[] {
  const next = normalizeWorkItemSpacerLayout(layout);
  const present = new Set(next);
  ids.forEach(id => { if (!present.has(id)) { next.push(id); present.add(id); } });
  return next;
}

/** Inverse of visible projection: hidden IDs consume no visible slot. */
export function replaceVisibleSpacerPositions(layout: readonly WorkItemSpacerToken[], visibleIds: readonly number[], positions: Readonly<Record<number, number>>, preserveTrailingSlots = false): WorkItemSpacerToken[] {
  const visible = new Set(visibleIds);
  const entries = visibleIds.map(id => [id, positions[id]] as const);
  if (entries.some(([, slot]) => slot === undefined || !Number.isInteger(slot) || slot < 0) || new Set(entries.map(([, slot]) => slot)).size !== entries.length) return [...layout];
  const oldVisibleLength = preserveTrailingSlots ? layout.filter(token => token === null || visible.has(token)).length : 0;
  const desired: WorkItemSpacerToken[] = Array.from({ length: Math.max(oldVisibleLength, Math.max(-1, ...entries.map(([, slot]) => slot!)) + 1) }, () => null);
  entries.forEach(([id, slot]) => { desired[slot!] = id; });
  const hiddenAt = new Map<number, number[]>();
  let projectedIndex = 0;
  layout.forEach(token => {
    if (token !== null && !visible.has(token)) {
      const anchor = Math.min(projectedIndex, desired.length);
      hiddenAt.set(anchor, [...(hiddenAt.get(anchor) ?? []), token]);
    } else projectedIndex += 1;
  });
  const next: WorkItemSpacerToken[] = [];
  for (let index = 0; index <= desired.length; index += 1) {
    next.push(...(hiddenAt.get(index) ?? []));
    if (index < desired.length) next.push(desired[index]!);
  }
  return next;
}
