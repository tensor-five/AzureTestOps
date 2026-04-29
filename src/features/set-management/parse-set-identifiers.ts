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
