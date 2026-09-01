import * as React from "react";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { sortTestSuiteTickets, type TestSuiteTicketSort } from "./test-suite-ticket-sorting.js";

export type SuiteTicketSortingApi = {
  activeSortFor(suiteId: number): TestSuiteTicketSort | null;
  openMenuSuiteId: number | null;
  toggleMenu(suiteId: number): void;
  selectSort(suiteId: number, sort: TestSuiteTicketSort): void;
  sortTickets(suiteId: number, tickets: readonly TestCaseProjection[]): TestCaseProjection[];
};

/** Holds per-suite sorting for the current UI session without persisting it. */
export function useSuiteTicketSorting(): SuiteTicketSortingApi {
  const [sorts, setSorts] = React.useState<ReadonlyMap<number, TestSuiteTicketSort>>(() => new Map());
  const [openMenuSuiteId, setOpenMenuSuiteId] = React.useState<number | null>(null);

  const activeSortFor = React.useCallback(
    (suiteId: number) => sorts.get(suiteId) ?? null,
    [sorts]
  );

  const toggleMenu = React.useCallback((suiteId: number) => {
    setOpenMenuSuiteId((current) => current === suiteId ? null : suiteId);
  }, []);

  const selectSort = React.useCallback((suiteId: number, sort: TestSuiteTicketSort) => {
    setSorts((current) => {
      const next = new Map(current);
      next.set(suiteId, sort);
      return next;
    });
    setOpenMenuSuiteId(null);
  }, []);

  const sortTickets = React.useCallback(
    (suiteId: number, tickets: readonly TestCaseProjection[]) => {
      const sort = sorts.get(suiteId);
      return sort ? sortTestSuiteTickets(tickets, sort) : tickets.slice();
    },
    [sorts]
  );

  return { activeSortFor, openMenuSuiteId, toggleMenu, selectSort, sortTickets };
}
