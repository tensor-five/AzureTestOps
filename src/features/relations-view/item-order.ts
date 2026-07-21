export type ItemOrderEdge = "before" | "after";
export type ItemReorderDirection = "up" | "down";

export type AdjacentItemMove = {
  targetId: number;
  edge: ItemOrderEdge;
};

/**
 * Expands a persisted (possibly partial) order with every id from the current
 * natural order. Persisted stale ids deliberately remain in place so a
 * temporarily missing item does not silently lose its user-defined position.
 */
export function materializeItemOrder(
  persistedOrder: readonly number[],
  naturalOrder: readonly number[]
): number[] {
  const materialized: number[] = [];
  const seen = new Set<number>();

  appendValidUniqueIds(materialized, seen, persistedOrder);
  appendValidUniqueIds(materialized, seen, naturalOrder);

  return materialized;
}

/** Moves one existing id exactly before or after another in a complete order. */
export function moveItemInOrder(
  persistedOrder: readonly number[],
  naturalOrder: readonly number[],
  sourceId: number,
  targetId: number,
  edge: ItemOrderEdge
): number[] {
  const materialized = materializeItemOrder(persistedOrder, naturalOrder);
  if (
    !isValidItemId(sourceId) ||
    !isValidItemId(targetId) ||
    sourceId === targetId ||
    (edge !== "before" && edge !== "after")
  ) {
    return materialized;
  }

  const sourceIndex = materialized.indexOf(sourceId);
  const targetIndex = materialized.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return materialized;
  }

  materialized.splice(sourceIndex, 1);
  const adjustedTargetIndex = materialized.indexOf(targetId);
  const insertAt = edge === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  materialized.splice(insertAt, 0, sourceId);
  return materialized;
}

/** Resolves an ArrowUp/ArrowDown move against the currently visible order. */
export function resolveAdjacentItemMove(
  visibleOrder: readonly number[],
  sourceId: number,
  direction: ItemReorderDirection
): AdjacentItemMove | null {
  const sourceIndex = visibleOrder.indexOf(sourceId);
  if (sourceIndex === -1) {
    return null;
  }

  const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
  const targetId = visibleOrder[targetIndex];
  if (!isValidItemId(targetId)) {
    return null;
  }

  return {
    targetId,
    edge: direction === "up" ? "before" : "after"
  };
}

function appendValidUniqueIds(
  target: number[],
  seen: Set<number>,
  candidates: readonly number[]
): void {
  for (const id of candidates) {
    if (!isValidItemId(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    target.push(id);
  }
}

function isValidItemId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
