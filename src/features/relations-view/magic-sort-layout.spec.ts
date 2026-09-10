import { describe, expect, it } from "vitest";

import { planMagicSort } from "./magic-sort-layout.js";

describe("Magic Sort spacer baseline", () => {
  it("compacts connected Bugs after visible unlinked Bugs instead of retaining stale spacer positions", () => {
    const layout = planMagicSort({
      suites: [{ suiteId: 11, testCaseIds: [101, 102] }],
      visibleRows: [
        { kind: "suite-header", suiteId: 11 },
        { kind: "test-case", suiteId: 11, testCaseId: 101 },
        { kind: "test-case", suiteId: 11, testCaseId: 102 }
      ],
      addSpacer: true,
      workItemIds: [301, 302, 201, 202],
      workItemPositions: { 301: 0, 302: 1, 201: 61, 202: 64 },
      workItems: [
        { id: 301, relatedTestCaseIds: [] },
        { id: 302, relatedTestCaseIds: [] },
        { id: 201, relatedTestCaseIds: [101] },
        { id: 202, relatedTestCaseIds: [102] }
      ]
    }).steps[0]!;

    expect(layout.workItemIds).toEqual([301, 302, 201, 202]);
    expect(layout.workItemPositions).toEqual({ 301: 0, 302: 1, 201: 3, 202: 4 });
  });
});
