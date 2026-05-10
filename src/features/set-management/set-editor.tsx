import * as React from "react";

import type { Set, SetDraft } from "../../domain/sets/set.js";

import {
  parsePlanAndSuite,
  parseQueryIdentifier
} from "./parse-set-identifiers.js";

export type SetEditorProps = {
  existing: Set | null;
  /** True iff the local server has a configured ADO context. Disables submit otherwise. */
  hasAdoContext: boolean;
  onCancel(): void;
  onSubmit(draft: SetDraft, setActive: boolean, setId: string | null): Promise<void>;
};

type IdentifierKind = "query";

/**
 * Form for creating or editing a Set. Each identifier (plan, root suite,
 * saved query) is a free-text input that accepts either the raw id or a
 * pasted Azure DevOps URL — the parser pulls the canonical id out, and the
 * resolved value renders below the field as visible feedback.
 *
 * The dropdown-driven catalog browser was removed because in practice users
 * already have the URL in front of them when they're configuring a set, and
 * round-tripping through `/phase2/test-plans` only adds friction. The catalog
 * routes / adapters stay wired so a future autocomplete affordance can pick
 * them up without re-plumbing the server.
 */
export function SetEditor(props: SetEditorProps): React.ReactElement {
  const { existing } = props;
  const [name, setName] = React.useState(existing?.name ?? "");
  const [planSuiteInput, setPlanSuiteInput] = React.useState(
    initialPlanSuiteInput(existing)
  );
  const [planName, setPlanName] = React.useState(existing?.planName ?? "");
  const [suiteName, setSuiteName] = React.useState(existing?.rootSuiteName ?? "");
  const [queryInput, setQueryInput] = React.useState(existing?.queryId ?? "");
  const [queryName, setQueryName] = React.useState(existing?.queryName ?? "");
  const [setActive, setSetActive] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const { planId, rootSuiteId: suiteId } = parsePlanAndSuite(planSuiteInput);
  const queryId = parseQueryIdentifier(queryInput);

  const canSubmit =
    !submitting &&
    props.hasAdoContext &&
    name.trim().length > 0 &&
    planId !== null &&
    suiteId !== null &&
    queryId !== null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canSubmit || !planId || !suiteId || !queryId) {
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const draft: SetDraft = {
        name: name.trim(),
        planId,
        planName: planName.trim() || undefined,
        rootSuiteId: suiteId,
        rootSuiteName: suiteName.trim() || undefined,
        queryId,
        queryName: queryName.trim() || undefined
      };
      await props.onSubmit(draft, setActive, existing?.id ?? null);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save set.");
    } finally {
      setSubmitting(false);
    }
  };

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
        <PlanSuiteField
          value={planSuiteInput}
          onChange={setPlanSuiteInput}
          planId={planId}
          rootSuiteId={suiteId}
        />
        <label className="set-editor-field">
          <span>Plan name (optional)</span>
          <input
            type="text"
            value={planName}
            onChange={(event) => setPlanName(event.currentTarget.value)}
            placeholder="Shown in the header dropdown"
          />
        </label>
        <label className="set-editor-field">
          <span>Root suite name (optional)</span>
          <input
            type="text"
            value={suiteName}
            onChange={(event) => setSuiteName(event.currentTarget.value)}
          />
        </label>
      </fieldset>

      <fieldset className="set-editor-fieldset">
        <legend>Saved Query</legend>
        <IdentifierField
          label="Query GUID or URL"
          placeholder="766fb375-befe-4752-add8-4b2d692f9c45 or https://dev.azure.com/{org}/{project}/_queries/query/<guid>/"
          value={queryInput}
          onChange={setQueryInput}
          resolvedId={queryId}
          kind="query"
        />
        <label className="set-editor-field">
          <span>Query name (optional)</span>
          <input
            type="text"
            value={queryName}
            onChange={(event) => setQueryName(event.currentTarget.value)}
            placeholder="Shown in the set list"
          />
        </label>
      </fieldset>

      <label className="set-editor-checkbox">
        <input
          type="checkbox"
          checked={setActive}
          onChange={(event) => setSetActive(event.currentTarget.checked)}
        />
        <span>{existing ? "Set this as active after saving" : "Activate this set after creation"}</span>
      </label>

      {submitError ? (
        <p className="set-editor-error" role="alert">
          {submitError}
        </p>
      ) : null}

      <footer className="set-editor-actions">
        <button type="button" className="u-btn" onClick={props.onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="u-btn u-btn-primary" disabled={!canSubmit}>
          {existing ? "Save changes" : "Create set"}
        </button>
      </footer>
    </form>
  );
}

function IdentifierField(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  resolvedId: string | null;
  kind: IdentifierKind;
}): React.ReactElement {
  const showHint = props.value.trim().length > 0;
  const matched = props.resolvedId !== null;

  return (
    <label className="set-editor-field">
      <span>{props.label}</span>
      <input
        type="text"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        required
        placeholder={props.placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {showHint ? (
        matched ? (
          <small className="set-editor-field-hint">
            Resolved {labelFor(props.kind)}: <code>{props.resolvedId}</code>
          </small>
        ) : (
          <small className="set-editor-field-hint set-editor-field-hint-error">
            Could not extract a {labelFor(props.kind)} from the input.
          </small>
        )
      ) : null}
    </label>
  );
}

/**
 * Combined plan-and-root-suite input. The Azure DevOps Test Plans URL carries
 * both ids as `?planId=…&suiteId=…`, so a single paste covers both. The
 * field also accepts two integers separated by `/`, `,` or whitespace for
 * users who only have the bare ids.
 */
function PlanSuiteField(props: {
  value: string;
  onChange: (next: string) => void;
  planId: string | null;
  rootSuiteId: string | null;
}): React.ReactElement {
  const trimmed = props.value.trim();
  const showHint = trimmed.length > 0;
  const planResolved = props.planId !== null;
  const suiteResolved = props.rootSuiteId !== null;
  const bothResolved = planResolved && suiteResolved;

  return (
    <label className="set-editor-field">
      <span>Plan URL or Plan ID / Suite ID</span>
      <input
        type="text"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        required
        placeholder="https://dev.azure.com/{org}/{project}/_testPlans/define?planId=...&suiteId=... or 42 / 43"
        spellCheck={false}
        autoComplete="off"
      />
      {showHint ? (
        bothResolved ? (
          <small className="set-editor-field-hint">
            Resolved plan id: <code>{props.planId}</code> · root suite id:{" "}
            <code>{props.rootSuiteId}</code>
          </small>
        ) : (
          <small className="set-editor-field-hint set-editor-field-hint-error">
            {planResolved
              ? "Missing root suite id — paste the full Test Plans URL or add the suite id (e.g. 42 / 43)."
              : suiteResolved
                ? "Missing plan id — paste the full Test Plans URL or add the plan id (e.g. 42 / 43)."
                : "Could not extract plan and suite ids from the input."}
          </small>
        )
      ) : null}
    </label>
  );
}

function initialPlanSuiteInput(existing: Set | null): string {
  if (!existing) {
    return "";
  }
  return `${existing.planId} / ${existing.rootSuiteId}`;
}

function labelFor(kind: IdentifierKind): string {
  switch (kind) {
    case "query":
      return "query GUID";
  }
}
