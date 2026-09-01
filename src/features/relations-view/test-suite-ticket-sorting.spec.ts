import { describe, expect, it } from "vitest";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { sortTestSuiteTickets } from "./test-suite-ticket-sorting.js";

function ticket(workItemId: number, title: string, lastOutcome: string): TestCaseProjection {
  return {
    workItemId,
    suiteId: 11,
    suitePath: "Release > Authentication",
    title,
    state: "Design",
    workItemType: "Test Case",
    assignedTo: null,
    tags: [],
    areaPath: null,
    priority: null,
    relatedIds: [],
    testPointId: null,
    configurationId: null,
    configurationName: null,
    lastOutcome,
    lastResultId: null,
    lastResultCompletedDate: null,
    lastRunId: null
  };
}

describe("sortTestSuiteTickets", () => {
  it("sortiert Titel ohne Beachtung der Groß- und Kleinschreibung in beide Richtungen", () => {
    const tickets = [
      ticket(3, "Payment – Zulu", "Passed"),
      ticket(1, "payment – alpha", "Failed"),
      ticket(2, "Profile – Banana", "NotRun")
    ];

    expect(sortTestSuiteTickets(tickets, "title-ascending").map(({ workItemId }) => workItemId))
      .toEqual([1, 3, 2]);
    expect(sortTestSuiteTickets(tickets, "title-descending").map(({ workItemId }) => workItemId))
      .toEqual([2, 3, 1]);
  });

  it("sortiert Outcomes stabil ohne Beachtung der Groß- und Kleinschreibung", () => {
    const tickets = [
      ticket(3, "Zulu", "passed"),
      ticket(1, "Alpha", "PASSED"),
      ticket(2, "Bravo", "blocked")
    ];

    expect(sortTestSuiteTickets(tickets, "outcome-ascending").map(({ workItemId }) => workItemId))
      .toEqual([2, 3, 1]);
    expect(sortTestSuiteTickets(tickets, "outcome-descending").map(({ workItemId }) => workItemId))
      .toEqual([3, 1, 2]);
  });
});
