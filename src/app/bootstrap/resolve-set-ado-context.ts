import type { AdoContext } from "../../application/ports/ado-context.port.js";
import type { Set } from "../../domain/sets/set.js";

type SetAdoContextFields = Pick<Set, "organization" | "project">;

/**
 * Resolves the ADO context a Set should use for browser-side deep links.
 * Complete Set overrides win; otherwise the currently persisted context is used.
 */
export function resolveSetAdoContext(
  set: SetAdoContextFields | null | undefined,
  fallback: AdoContext | null
): AdoContext | null {
  const overrideOrganization = clean(set?.organization);
  const overrideProject = clean(set?.project);
  if (overrideOrganization && overrideProject) {
    return { organization: overrideOrganization, project: overrideProject };
  }

  const fallbackOrganization = clean(fallback?.organization);
  const fallbackProject = clean(fallback?.project);
  if (!fallbackOrganization || !fallbackProject) {
    return null;
  }
  return { organization: fallbackOrganization, project: fallbackProject };
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
