/**
 * Pure helpers that turn whatever the user pastes into the set-editor (raw
 * id or full Azure DevOps URL) into the canonical id string the API expects.
 *
 * Why parse client-side: testers routinely copy URLs out of the ADO web UI
 * (`_testPlans/define?planId=…&suiteId=…`, `_queries/query/<guid>`) and
 * forcing them to hand-extract the numeric id is the kind of paper cut that
 * accumulates fast across set creation. The functions stay pure so they can
 * be reused by future "paste a URL anywhere" affordances.
 */

const QUERY_GUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Accepts a positive integer id, or extracts `planId=<n>` from an Azure
 * DevOps Test Plans URL like
 * `https://dev.azure.com/{org}/{project}/_testPlans/define?planId=10519879&suiteId=…`.
 */
export function parsePlanIdentifier(input: string): string | null {
  return parseNumericQueryParam(input, "planId");
}

/**
 * Accepts a positive integer id, or extracts `suiteId=<n>` from an Azure
 * DevOps Test Plans URL.
 */
export function parseSuiteIdentifier(input: string): string | null {
  return parseNumericQueryParam(input, "suiteId");
}

export type PlanAndSuite = {
  planId: string | null;
  rootSuiteId: string | null;
};

/**
 * Parses both plan and root suite ids out of a single user input. The Azure
 * DevOps Test Plans URL already carries both as `?planId=…&suiteId=…`, so
 * forcing the user to paste the same URL into two fields is busywork. This
 * helper accepts either:
 *   - a full Test Plans URL (extracts both ids in one go)
 *   - two integer ids separated by `/`, `,` or whitespace
 *     (e.g. `10519879 / 10519880`, `10519879,10519880`, `10519879 10519880`)
 *   - a single bare integer (treated as plan id only; suite id stays null)
 */
export function parsePlanAndSuite(input: string): PlanAndSuite {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { planId: null, rootSuiteId: null };
  }

  // Bare integer: plan id only — caller decides whether the missing suite is
  // a hard error. Handle this before delegating to parseNumericQueryParam,
  // which would otherwise return the same number for both param names.
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return n > 0 ? { planId: String(n), rootSuiteId: null } : { planId: null, rootSuiteId: null };
  }

  // Manual id pair: split on whitespace, slash or comma.
  const parts = trimmed.split(/[\s/,]+/).filter((part) => part.length > 0);
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return { planId: parts[0], rootSuiteId: parts[1] };
  }

  // Otherwise treat as URL-ish input and pull both query params out.
  return {
    planId: parseNumericQueryParam(trimmed, "planId"),
    rootSuiteId: parseNumericQueryParam(trimmed, "suiteId")
  };
}

/**
 * Accepts a saved-query GUID, or extracts the GUID from an Azure DevOps URL
 * like `https://dev.azure.com/{org}/{project}/_queries/query/<guid>/`.
 */
export function parseQueryIdentifier(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const match = QUERY_GUID_PATTERN.exec(trimmed);
  return match ? match[0].toLowerCase() : null;
}

function parseNumericQueryParam(input: string, paramName: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Bare positive integer.
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? String(n) : null;
  }

  // Try real URL parsing first; fall back to regex on malformed input.
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get(paramName);
    if (fromQuery && /^\d+$/.test(fromQuery)) {
      return fromQuery;
    }
  } catch {
    // not a URL — fall through
  }
  const pattern = new RegExp(`[?&#]${paramName}=(\\d+)`, "i");
  const match = pattern.exec(trimmed);
  return match ? match[1] : null;
}
