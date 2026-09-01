import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";

export type TestSuiteTicketSort =
  | "outcome-ascending"
  | "outcome-descending"
  | "title-ascending"
  | "title-descending";

export function sortTestSuiteTickets(
  tickets: readonly TestCaseProjection[],
  sort: TestSuiteTicketSort
): TestCaseProjection[] {
  const field = sort.startsWith("outcome") ? "lastOutcome" : "title";
  const direction = sort.endsWith("ascending") ? 1 : -1;

  return tickets
    .map((ticket, index) => ({ ticket, index }))
    .sort((left, right) => {
      const comparison = normalized(left.ticket[field]).localeCompare(normalized(right.ticket[field]));
      return comparison === 0 ? left.index - right.index : direction * comparison;
    })
    .map(({ ticket }) => ticket);
}

function normalized(value: string): string {
  return value.toLocaleLowerCase();
}
