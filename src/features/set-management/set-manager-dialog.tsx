import * as React from "react";

import {
  ApiError,
  getAdoContext,
  listSavedQueries,
  listSuitesForPlan,
  listTestPlans,
  setAdoContext as saveAdoContext,
  type AdoContext
} from "../api/api-client.js";
import type { Set, SetDraft } from "../../domain/sets/set.js";
import type { SavedQuery } from "../../domain/queries/saved-query.js";
import type {
  TestPlanSummary,
  TestSuiteSummary
} from "../../domain/test-management/test-plan.js";

export type SetManagerDialogProps = {
  isOpen: boolean;
  sets: Set[];
  activeSetId: string | null;
  onClose(): void;
  onCreate(draft: SetDraft & { setActive?: boolean }): Promise<Set>;
  onUpdate(setId: string, patch: Partial<SetDraft>): Promise<Set>;
  onDelete(setId: string): Promise<void>;
  onSetActive(setId: string | null): Promise<void>;
};

type Mode = { kind: "list" } | { kind: "edit"; setId: string | null };

/**
 * Modal that drives Set CRUD plus the ADO-context bootstrap step. The first
 * time this dialog opens against an empty `~/.azure-testops/ado-context.json`,
 * it forces the user to fill in organization + project before catalog calls
 * can resolve. After that the form steps through plan → root suite → query
 * pickers backed by `/phase2/test-plans`, `…/suites`, `/phase2/saved-queries`.
 */
export function SetManagerDialog(props: SetManagerDialogProps): React.ReactElement | null {
  const { isOpen, sets, activeSetId } = props;
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });

  React.useEffect(() => {
    if (!isOpen) {
      setMode({ kind: "list" });
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="set-manager-backdrop" role="presentation" onClick={props.onClose}>
      <div
        className="set-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Manage sets"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="set-manager-header">
          <h2>Manage sets</h2>
          <button
            type="button"
            className="set-manager-close"
            onClick={props.onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {mode.kind === "list" ? (
          <SetManagerList
            sets={sets}
            activeSetId={activeSetId}
            onCreate={() => setMode({ kind: "edit", setId: null })}
            onEdit={(setId) => setMode({ kind: "edit", setId })}
            onDelete={props.onDelete}
            onSetActive={props.onSetActive}
          />
        ) : (
          <SetEditor
            existing={mode.setId ? sets.find((entry) => entry.id === mode.setId) ?? null : null}
            onCancel={() => setMode({ kind: "list" })}
            onSubmit={async (draft, setActive, setId) => {
              if (setId) {
                await props.onUpdate(setId, draft);
                if (setActive) {
                  await props.onSetActive(setId);
                }
              } else {
                await props.onCreate({ ...draft, setActive });
              }
              setMode({ kind: "list" });
            }}
          />
        )}
      </div>
    </div>
  );
}

type SetManagerListProps = {
  sets: Set[];
  activeSetId: string | null;
  onCreate(): void;
  onEdit(setId: string): void;
  onDelete(setId: string): Promise<void>;
  onSetActive(setId: string | null): Promise<void>;
};

function SetManagerList(props: SetManagerListProps): React.ReactElement {
  const { sets, activeSetId } = props;
  return (
    <div className="set-manager-list">
      {sets.length === 0 ? (
        <p className="set-manager-empty">No sets yet — create your first one to start.</p>
      ) : (
        <ul>
          {sets.map((entry) => {
            const isActive = entry.id === activeSetId;
            return (
              <li key={entry.id} className="set-manager-row">
                <div className="set-manager-row-main">
                  <strong>{entry.name}</strong>
                  <span className="set-manager-row-meta">
                    {entry.planName ?? `Plan ${entry.planId}`} ·{" "}
                    {entry.queryName ?? "Saved query"}
                  </span>
                </div>
                <div className="set-manager-row-actions">
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => props.onSetActive(isActive ? null : entry.id)}
                  >
                    {isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" className="u-btn" onClick={() => props.onEdit(entry.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => {
                      if (confirm(`Delete set "${entry.name}"?`)) {
                        void props.onDelete(entry.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <footer className="set-manager-list-footer">
        <button type="button" className="u-btn u-btn-primary" onClick={props.onCreate}>
          New set
        </button>
      </footer>
    </div>
  );
}

type SetEditorProps = {
  existing: Set | null;
  onCancel(): void;
  onSubmit(draft: SetDraft, setActive: boolean, setId: string | null): Promise<void>;
};

type CatalogState = {
  plans: TestPlanSummary[];
  suites: TestSuiteSummary[];
  queries: SavedQuery[];
  loadingPlans: boolean;
  loadingSuites: boolean;
  loadingQueries: boolean;
  needsContext: boolean;
  catalogError: string | null;
};

const initialCatalogState: CatalogState = {
  plans: [],
  suites: [],
  queries: [],
  loadingPlans: false,
  loadingSuites: false,
  loadingQueries: false,
  needsContext: false,
  catalogError: null
};

function SetEditor(props: SetEditorProps): React.ReactElement {
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

  const [catalog, setCatalog] = React.useState<CatalogState>(initialCatalogState);
  const [adoContext, setAdoContextLocal] = React.useState<AdoContext | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const context = await getAdoContext();
        setAdoContextLocal(context);
        if (!context) {
          setCatalog((current) => ({ ...current, needsContext: true }));
          return;
        }
        await refreshCatalog(setCatalog);
      } catch (error) {
        setCatalog((current) => ({
          ...current,
          catalogError: error instanceof Error ? error.message : "Failed to load catalog"
        }));
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!planId) {
      setCatalog((current) => ({ ...current, suites: [] }));
      return;
    }
    const numericPlanId = Number.parseInt(planId, 10);
    if (!Number.isFinite(numericPlanId)) {
      return;
    }
    setCatalog((current) => ({ ...current, loadingSuites: true, catalogError: null }));
    listSuitesForPlan(numericPlanId)
      .then((suites) => {
        setCatalog((current) => ({ ...current, suites, loadingSuites: false }));
      })
      .catch((error) => {
        setCatalog((current) => ({
          ...current,
          loadingSuites: false,
          catalogError: error instanceof Error ? error.message : "Failed to load suites"
        }));
      });
  }, [planId]);

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

  if (catalog.needsContext) {
    return (
      <AdoContextSetup
        onSaved={async (context) => {
          await saveAdoContext(context);
          setAdoContextLocal(context);
          setCatalog((current) => ({ ...current, needsContext: false }));
          await refreshCatalog(setCatalog);
        }}
        onCancel={props.onCancel}
      />
    );
  }

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
          loading={catalog.loadingPlans}
          options={catalog.plans.map((plan) => ({
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
          loading={catalog.loadingSuites}
          disabled={!planId}
          options={catalog.suites.map((suite) => ({
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
          loading={catalog.loadingQueries}
          options={catalog.queries.map((query) => ({
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

      {catalog.catalogError ? (
        <p className="set-editor-error" role="alert">
          {catalog.catalogError}
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
          disabled={submitting || !adoContext}
        >
          {existing ? "Save changes" : "Create set"}
        </button>
      </footer>
    </form>
  );
}

async function refreshCatalog(
  setCatalog: React.Dispatch<React.SetStateAction<CatalogState>>
): Promise<void> {
  setCatalog((current) => ({
    ...current,
    loadingPlans: true,
    loadingQueries: true,
    catalogError: null
  }));
  try {
    const [plans, queries] = await Promise.all([listTestPlans(), listSavedQueries()]);
    setCatalog((current) => ({
      ...current,
      plans,
      queries,
      loadingPlans: false,
      loadingQueries: false
    }));
  } catch (error) {
    if (error instanceof ApiError && error.code === "ADO_CONTEXT_NOT_CONFIGURED") {
      setCatalog((current) => ({
        ...current,
        loadingPlans: false,
        loadingQueries: false,
        needsContext: true
      }));
      return;
    }
    setCatalog((current) => ({
      ...current,
      loadingPlans: false,
      loadingQueries: false,
      catalogError: error instanceof Error ? error.message : "Failed to load catalog"
    }));
  }
}

type SelectOption = { value: string; label: string; meta?: string };

type SelectFromCatalogProps = {
  label: string;
  loading: boolean;
  disabled?: boolean;
  options: SelectOption[];
  value: string;
  onSelect(value: string, option: SelectOption | null): void;
  requiredText: string;
};

function SelectFromCatalog(props: SelectFromCatalogProps): React.ReactElement {
  return (
    <label className="set-editor-field">
      <span>{props.label}</span>
      <select
        value={props.value}
        disabled={props.disabled || props.loading}
        required
        onChange={(event) => {
          const next = event.currentTarget.value;
          const option = props.options.find((entry) => entry.value === next) ?? null;
          props.onSelect(next, option);
        }}
      >
        <option value="" disabled>
          {props.loading ? "Loading…" : props.requiredText}
        </option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.meta ? ` — ${option.meta}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

type AdoContextSetupProps = {
  onSaved(context: AdoContext): Promise<void>;
  onCancel(): void;
};

function AdoContextSetup(props: AdoContextSetupProps): React.ReactElement {
  const [organization, setOrganization] = React.useState("");
  const [project, setProject] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await props.onSaved({ organization: organization.trim(), project: project.trim() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save context.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="set-editor" onSubmit={handleSubmit}>
      <p className="set-editor-help">
        Configure your Azure DevOps organization and project before creating a set. The values are
        stored locally in <code>~/.azure-testops/ado-context.json</code>.
      </p>
      <label className="set-editor-field">
        <span>Organization</span>
        <input
          type="text"
          value={organization}
          onChange={(event) => setOrganization(event.currentTarget.value)}
          required
          placeholder="contoso"
        />
      </label>
      <label className="set-editor-field">
        <span>Project</span>
        <input
          type="text"
          value={project}
          onChange={(event) => setProject(event.currentTarget.value)}
          required
          placeholder="Delivery"
        />
      </label>
      {error ? (
        <p className="set-editor-error" role="alert">
          {error}
        </p>
      ) : null}
      <footer className="set-editor-actions">
        <button type="button" className="u-btn" onClick={props.onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="u-btn u-btn-primary" disabled={submitting}>
          Save context
        </button>
      </footer>
    </form>
  );
}
