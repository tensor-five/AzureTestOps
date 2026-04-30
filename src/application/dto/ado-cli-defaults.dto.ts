/**
 * Pre-populated organization / project pair surfaced by `az devops
 * configure --list`. Used by the first-run setup form to remove typos before
 * they hit `~/.azure-testops/ado-context.json`. Both fields default to the
 * empty string when the CLI did not report a value.
 */
export type AdoCliDefaults = {
  organization: string;
  project: string;
};
