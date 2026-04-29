import * as React from "react";

import {
  ApiError,
  listSuitesForPlan,
  listTestPlans
} from "../api/api-client.js";
import type {
  TestPlanSummary,
  TestSuiteSummary
} from "../../domain/test-management/test-plan.js";

export type TestPlanCatalogState = {
  plans: TestPlanSummary[];
  suites: TestSuiteSummary[];
  isLoadingPlans: boolean;
  isLoadingSuites: boolean;
  needsContext: boolean;
  error: string | null;
};

export type TestPlanCatalogApi = TestPlanCatalogState & {
  /** Re-runs the plans listing; suites refresh follows when `selectedPlanId` changes. */
  refreshPlans(): Promise<void>;
};

const INITIAL_STATE: TestPlanCatalogState = {
  plans: [],
  suites: [],
  isLoadingPlans: false,
  isLoadingSuites: false,
  needsContext: false,
  error: null
};

/**
 * Plans + plan-scoped suites for the Set-creation pickers. Encapsulates the
 * two HTTP round-trips (`/phase2/test-plans`, `…/suites`) so the editor
 * component stays declarative; passing `null` for `selectedPlanId` clears
 * the suites slice.
 *
 * On `ADO_CONTEXT_NOT_CONFIGURED` the hook surfaces `needsContext: true`
 * instead of an error so the dialog can render the bootstrap step.
 */
export function useTestPlanCatalog(selectedPlanId: number | null): TestPlanCatalogApi {
  const [state, setState] = React.useState<TestPlanCatalogState>(INITIAL_STATE);

  const refreshPlans = React.useCallback(async () => {
    setState((current) => ({ ...current, isLoadingPlans: true, error: null }));
    try {
      const plans = await listTestPlans();
      setState((current) => ({
        ...current,
        plans,
        isLoadingPlans: false,
        needsContext: false
      }));
    } catch (error) {
      if (error instanceof ApiError && error.code === "ADO_CONTEXT_NOT_CONFIGURED") {
        setState((current) => ({
          ...current,
          plans: [],
          isLoadingPlans: false,
          needsContext: true,
          error: null
        }));
        return;
      }
      setState((current) => ({
        ...current,
        isLoadingPlans: false,
        error: error instanceof Error ? error.message : "Failed to load test plans."
      }));
    }
  }, []);

  React.useEffect(() => {
    void refreshPlans();
  }, [refreshPlans]);

  React.useEffect(() => {
    if (selectedPlanId === null) {
      setState((current) => ({ ...current, suites: [] }));
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoadingSuites: true, error: null }));
    listSuitesForPlan(selectedPlanId)
      .then((suites) => {
        if (cancelled) return;
        setState((current) => ({ ...current, suites, isLoadingSuites: false }));
      })
      .catch((error) => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          isLoadingSuites: false,
          error: error instanceof Error ? error.message : "Failed to load suites."
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPlanId]);

  return {
    ...state,
    refreshPlans
  };
}
