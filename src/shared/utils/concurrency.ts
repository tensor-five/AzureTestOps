/**
 * Maps over an iterable with bounded concurrency. Preserves input order in
 * the output, regardless of resolution order. Handy for hitting an API a
 * few hundred times without firing them all simultaneously.
 *
 * Concurrency is clamped to [1, items.length].
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const total = items.length;
  if (total === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, total));
  const results: R[] = new Array(total);
  let nextIndex = 0;

  async function runOne(): Promise<void> {
    while (nextIndex < total) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < limit; i += 1) {
    workers.push(runOne());
  }
  await Promise.all(workers);

  return results;
}
