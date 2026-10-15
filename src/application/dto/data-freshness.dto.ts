/** Age of the oldest source data used by a view; cache hits never advance this timestamp. */
export type DataFreshness = {
  sourceReadAt: string;
  cacheUsed: boolean;
};
