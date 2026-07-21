export type FacetOption = {
  value: string;
  count: number;
};

/** Counts each distinct row once per facet value and preserves the supplied order. */
export function buildFacetOptions<T>(
  values: readonly string[],
  rows: readonly T[],
  readValues: (row: T) => readonly string[]
): FacetOption[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const seen = new Set<string>();
    readValues(row).forEach((value) => {
      if (value.length === 0 || seen.has(value)) {
        return;
      }
      seen.add(value);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
  });
  return values.map((value) => ({ value, count: counts.get(value) ?? 0 }));
}
