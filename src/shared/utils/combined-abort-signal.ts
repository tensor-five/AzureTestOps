/** Preserves a single cancellation scope and combines only distinct signals. */
export function combinedAbortSignal(first?: AbortSignal, second?: AbortSignal): AbortSignal | undefined {
  if (!first) return second;
  if (!second || first === second) return first;
  return AbortSignal.any([first, second]);
}
