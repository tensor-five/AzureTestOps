import * as React from "react";

import type { Set, SetDraft } from "../../domain/sets/set.js";

import { SelectFromCatalog } from "./select-from-catalog.js";
import { useSavedQueries } from "./use-saved-queries.js";
import { useTestPlanCatalog } from "./use-test-plan-catalog.js";

export type SetEditorProps = {
  existing: Set | null;
  /** True iff the local server has a configured ADO context. Disables submit otherwise. */
  hasAdoContext: boolean;
  onCancel(): void;
  onSubmit(draft: SetDraft, setActive: boolean, setId: string | null): Promise<void>;
};

/**
 * Form for creating or editing a Set. All catalog data flows in through the
 * three feature hooks (`useTestPlanCatalog`, `useSavedQueries`) so the
 * component stays declarative and `api-client` access lives in exactly one
 * place per resource.
 */
export function SetEditor(props: SetEditorProps): React.ReactElement {
  const { existing } = props;
  const [name, setName] = React.useState(existing?.name ?? "");
  const [planId, setPlanId] = React.useState(existing?.planId ?? "");
  const [planName, setPlanName] = React.useState(existing?.planName ?? "");
  const [rootSuiteId, setRootSuiteId] = React.useState(existing?.rootSuiteId ?? "");
  const [rootSuiteName, setRootSuiteName] = React.useState(existing?.rootSuiteName ?? "");
  const [queryId, setQueryId] = React.useState(existing?.queryId ?? "");
  const [queryName, setQueryName] = React.useState(existing?.queryName ?? "");
  const [setActive, setSetActive] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const numericPlanId = planId ? Number.parseInt(planId, 10) : Number.NaN;
  const planCatalog = useTestPlanCatalog(Number.isFinite(numericPlanId) ? numericPlanId : null);
  const queryCatalog = useSavedQueries();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const draft: SetDraft = {
        name: name.trim(),
        planId: planId.trim(),
        planName: planName.trim() || undefined,
        rootSuiteId: rootSuiteId.trim(),
        rootSuiteName: rootSuiteName.trim() || undefined,
        queryId: queryId.trim(),
        queryName: queryName.trim() || undefined
      };
      await props.onSubmit(draft, setActive, existing?.id ?? null);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save set.");
    } finally {
      setSubmitting(false);
    }
  };

  const catalogError = planCatalog.error ?? queryCatalog.error;

  return (
    <form className="set-editor" onSubmit={handleSubmit}>
      <fieldset className="set-editor-fieldset">
        <legend>Identity</legend>
        <label className="set-editor-field">
          <span>Display name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            placeholder="e.g. Sprint 24 — Login coverage"
          />
        </label>
      </fieldset>

      <fieldset className="set-editor-fieldset">
        <legend>Test Plan</legend>
        <SelectFromCatalog
          label="Plan"
          loading={planCatalog.isLoadingPlans}
          options={planCatalog.plans.map((plan) => ({
            value: String(plan.id),
            label: plan.name,
            meta: plan.areaPath ?? undefined
          }))}
          value={planId}
          onSelect={(value, option) => {
            setPlanId(value);
            setPlanName(option?.label ?? "");
            setRootSuiteId("");
            setRootSuiteName("");
          }}
          requiredText="Select a plan"
        />

        <SelectFromCatalog
          label="Root suite"
          loading={planCatalog.isLoadingSuites}
          disabled={!planId}
          options={planCatalog.suites.map((suite) => ({
            value: String(suite.id),
            label: suite.name,
            meta: suite.suiteType ?? undefined
          }))}
          value={rootSuiteId}
          onSelect={(value, option) => {
            setRootSuiteId(value);
            setRootSuiteName(option?.label ?? "");
          }}
          requiredText="Select a root suite"
        />
      </fieldset>

      <fieldset className="set-editor-fieldset">
        <legend>Saved Query</legend>
        <SelectFromCatalog
          label="Query"
          loading={queryCatalog.isLoading}
          options={queryCatalog.queries.map((query) => ({
            value: query.id,
            label: query.name,
            meta: query.path
          }))}
          value={queryId}
          onSelect={(value, option) => {
            setQueryId(value);
            setQueryName(option?.label ?? "");
          }}
          requiredText="Select a saved query"
        />
      </fieldset>

      <label className="set-editor-checkbox">
        <input
          type="checkbox"
          checked={setActive}
          onChange={(event) => setSetActive(event.currentTarget.checked)}
        />
        <span>{existing ? "Set this as active after saving" : "Activate this set after creation"}</span>
      </label>

      {catalogError ? (
        <p className="set-editor-error" role="alert">
          {catalogError}
        </p>
      ) : null}

      {submitError ? (
        <p className="set-editor-error" role="alert">
          {submitError}
        </p>
      ) : null}

      <footer className="set-editor-actions">
        <button type="button" className="u-btn" onClick={props.onCancel} disabled={submitting}>
          Cancel
        </button>
        <button
          type="submit"
          className="u-btn u-btn-primary"
          disabled={submitting || !props.hasAdoContext}
        >
          {existing ? "Save changes" : "Create set"}
        </button>
      </footer>
    </form>
  );
}
