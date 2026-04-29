import * as React from "react";

import type { AdoContext } from "../api/api-client.js";

export type AdoContextSetupProps = {
  onSaved(context: AdoContext): Promise<void>;
  onCancel(): void;
};

/**
 * One-time bootstrap form rendered when `~/.azure-testops/ado-context.json`
 * is missing. Held here (rather than as a route or top-level dialog) because
 * it surfaces only inside the Set-Manager flow on first run — once the
 * context is filled in, the regular set editor takes over.
 */
export function AdoContextSetup(props: AdoContextSetupProps): React.ReactElement {
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
