/**
 * Azure DevOps tenant the app is currently pointed at.
 *
 * `organization` is the org slug as it appears in
 * `https://dev.azure.com/{organization}/{project}`. `project` is the project
 * name. Both are required: every read/write talks to a fully qualified URL.
 */
export type AdoContext = {
  organization: string;
  project: string;
};

/**
 * Persistence boundary for {@link AdoContext}.
 *
 * The default adapter stores it outside the user-preferences file
 * (`~/.azure-testops/ado-context.json`) because:
 *   - it isn't user-scoped (one tenant per workstation in v1),
 *   - and decoupling it lets the lowdb prefs file move/share independently.
 */
export interface AdoContextPort {
  /** Returns `null` until the user explicitly configures the context. */
  getContext(): Promise<AdoContext | null>;
  setContext(context: AdoContext): Promise<AdoContext>;
}
