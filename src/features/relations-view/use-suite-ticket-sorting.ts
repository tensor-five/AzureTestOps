import * as React from "react";

import type { TestCaseProjection } from "../../domain/test-management/test-case-projection.js";
import { sortTestSuiteTickets, type TestSuiteTicketSort } from "./test-suite-ticket-sorting.js";

export type SuiteTicketSortingApi = {
  openMenuSuiteId: number | null;
  toggleMenu(suiteId: number): void;
  selectSort(
    suiteId: number,
    visibleTickets: readonly TestCaseProjection[],
    storedTickets: readonly TestCaseProjection[],
    sort: TestSuiteTicketSort
  ): TestCaseProjection[];
  reconcileStoredOrder(suiteId: number, tickets: readonly TestCaseProjection[]): void;
  sortTickets(suiteId: number, tickets: readonly TestCaseProjection[]): TestCaseProjection[];
};

type PendingOneTimeOrder = {
  sourceIds: readonly number[];
  sortedIds: readonly number[];
};

/**
 * Shows a selected sort result until the manually persisted order has re-rendered.
 * It deliberately never stores an active sorting mode, so later manual moves win.
 */
export function useSuiteTicketSorting(): SuiteTicketSortingApi {
  const [pendingOrders, setPendingOrders] = React.useState<ReadonlyMap<number, PendingOneTimeOrder>>(
    () => new Map()
  );
  const [openMenuSuiteId, setOpenMenuSuiteId] = React.useState<number | null>(null);

  const toggleMenu = React.useCallback((suiteId: number) => {
    setOpenMenuSuiteId((current) => current === suiteId ? null : suiteId);
  }, []);

  const selectSort = React.useCallback(
    (
      suiteId: number,
      visibleTickets: readonly TestCaseProjection[],
      storedTickets: readonly TestCaseProjection[],
      sort: TestSuiteTicketSort
    ) => {
      const sortedTickets = sortTestSuiteTickets(visibleTickets, sort);
      setPendingOrders((current) => {
        const next = new Map(current);
        next.set(suiteId, {
          sourceIds: storedTickets.map((ticket) => ticket.workItemId),
          sortedIds: sortedTickets.map((ticket) => ticket.workItemId)
        });
        return next;
      });
      setOpenMenuSuiteId(null);
      return sortedTickets;
    },
    []
  );

  const sortTickets = React.useCallback(
    (suiteId: number, tickets: readonly TestCaseProjection[]) => {
      const pending = pendingOrders.get(suiteId);
      if (!pending || !sameIds(tickets, pending.sourceIds)) {
        return tickets.slice();
      }
      const byId = new Map(tickets.map((ticket) => [ticket.workItemId, ticket]));
      return pending.sortedIds.flatMap((id) => {
        const ticket = byId.get(id);
        return ticket ? [ticket] : [];
      });
    },
    [pendingOrders]
  );

  const reconcileStoredOrder = React.useCallback(
    (suiteId: number, tickets: readonly TestCaseProjection[]) => {
      setPendingOrders((current) => {
        const pending = current.get(suiteId);
        if (!pending || sameIds(tickets, pending.sourceIds)) {
          return current;
        }
        const next = new Map(current);
        next.delete(suiteId);
        return next;
      });
    },
    []
  );

  return { openMenuSuiteId, toggleMenu, selectSort, reconcileStoredOrder, sortTickets };
}

function sameIds(tickets: readonly TestCaseProjection[], ids: readonly number[]): boolean {
  return tickets.length === ids.length && tickets.every((ticket, index) => ticket.workItemId === ids[index]);
}
