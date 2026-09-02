/**
 * Returns the ID from a complete work-item ID search. A leading # is accepted
 * for parity with the identifier displayed on relation cards.
 */
export function normalizeExactWorkItemIdQuery(query: string | undefined): string | null {
  const trimmed = query?.trim() ?? "";
  const id = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return /^\d+$/u.test(id) ? id : null;
}

/** Returns the user-entered complete ID form for card highlighting. */
export function exactWorkItemIdHighlightQuery(query: string | undefined): string {
  return normalizeExactWorkItemIdQuery(query) === null ? "" : query?.trim() ?? "";
}
