export type AdoCliDefaults = {
  organization: string;
  project: string;
};

/**
 * Parses the INI-style output of `az devops configure --list` and strips the
 * `https://dev.azure.com/...` prefix from the organization so the value lines
 * up with what the ADO context preference stores. Missing keys collapse to
 * empty strings rather than `undefined` so callers can compare directly
 * without null-handling everywhere.
 */
export function parseAdoCliDefaults(stdout: string): AdoCliDefaults {
  return {
    organization: normalizeOrganization(getValue(stdout, "organization")),
    project: getValue(stdout, "project")
  };
}

function getValue(stdout: string, key: "organization" | "project"): string {
  const expression = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m");
  const match = stdout.match(expression);
  return match ? match[1].trim() : "";
}

function normalizeOrganization(value: string): string {
  return value.replace(/^https?:\/\/dev\.azure\.com\//i, "").replace(/\/$/, "");
}
