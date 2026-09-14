/** Metadata belongs to the concrete suite Work Item, never to its cases, query or parent. */
export interface TestSuiteMetadataPort {
    /** Returns every requested ID, including empty tag arrays, or rejects incomplete/invalid metadata. */
    loadSuiteTags(suiteIds: number[]): Promise<Map<number, string[]>>;
}
