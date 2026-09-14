/** Swap visible neighbours in the full order, leaving all hidden positions intact. */
export function moveVisibleMatrixGroup(order: readonly string[], visibleIds: readonly string[], groupId: string, direction: number): string[] {
    const result = [...new Set([...order, ...visibleIds])];
    const visibleIndex = visibleIds.indexOf(groupId);
    if (visibleIndex < 0 || (direction !== -1 && direction !== 1)) return result;
    const neighbour = visibleIds[visibleIndex + direction];
    if (!neighbour) return result;
    const from = result.indexOf(groupId);
    const to = result.indexOf(neighbour);
    [result[from], result[to]] = [result[to], result[from]];
    return result;
}
