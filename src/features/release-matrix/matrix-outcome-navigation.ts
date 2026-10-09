/** Follows rendered row order across groups, skipping unavailable status fields. */
export function focusAdjacentMatrixOutcome(current: HTMLSelectElement, direction: 1 | -1): boolean {
    const column = current.closest<HTMLTableCellElement>('td[data-matrix-column]')?.dataset.matrixColumn;
    const table = current.closest('table');
    if (!table || column === undefined) return false;
    const outcomes = Array.from(table.querySelectorAll<HTMLSelectElement>('.matrix-cell-control select'))
        .filter(select => !select.disabled && select.closest<HTMLTableCellElement>('td[data-matrix-column]')?.dataset.matrixColumn === column);
    const index = outcomes.indexOf(current);
    const next = index < 0 ? undefined : outcomes[index + direction];
    if (!next) return false;
    next.focus();
    return true;
}
