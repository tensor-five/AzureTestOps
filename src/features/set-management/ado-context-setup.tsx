import * as React from "react";

import { getAdoCliDefaults, type AdoContext } from "../api/api-client.js";

export type AdoContextSetupProps = {
  /**
   * Pre-fills the form when present (edit mode); leave null for first-run
   * bootstrap. The same form serves both flows so the UX stays identical.
   */
  initial?: AdoContext | null;
  onSaved(context: AdoContext): Promise<void>;
  onCancel(): void;
};

/**
 * Form for the local Azure DevOps organization/project. Rendered both as the
 * one-time bootstrap (when `~/.azure-testops/ado-context.json` is missing)
 * and as the edit affordance reachable from the Set-Manager banner.
 *
 * On first-run the form pre-fills from `az devops configure --list` to
 * mirror what the Azure CLI already considers the active context, which
 * removes a class of typos before they hit the saved file.
 */
export function AdoContextSetup(props: AdoContextSetupProps): React.ReactElement {
  const initial = props.initial ?? null;
  const isEditing = initial !== null;
  const [organization, setOrganization] = React.useState(initial?.organization ?? "");
  const [project, setProject] = React.useState(initial?.project ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [defaultsHint, setDefaultsHint] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isEditing) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const defaults = await getAdoCliDefaults();
        if (cancelled) {
          return;
        }
        if (defaults.organization) {
          setOrganization((current) => (current.length === 0 ? defaults.organization : current));
        }
        if (defaults.project) {
          setProject((current) => (current.length === 0 ? defaults.project : current));
        }
        if (defaults.organization || defaults.project) {
          setDefaultsHint("Pre-filled from your Azure CLI defaults — verify before saving.");
        }
      } catch {
        // Defaults are optional; manual entry remains available.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditing]);

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
        {isEditing
          ? "Update your Azure DevOps organization and project. Existing sets reference ids that only resolve in their original org/project, so changing this will invalidate them."
          : "Configure your Azure DevOps organization and project before creating a set."}{" "}
        The values are stored locally in <code>~/.azure-testops/ado-context.json</code>.
      </p>
      {defaultsHint ? (
        <p className="set-editor-help" role="status">
          {defaultsHint}
        </p>
      ) : null}
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
          {isEditing ? "Save changes" : "Save context"}
        </button>
      </footer>
    </form>
  );
}
