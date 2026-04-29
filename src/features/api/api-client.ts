import type { Set, SetDraft } from "../../domain/sets/set.js";
import type {
  TestPlanSummary,
  TestSuiteSummary
} from "../../domain/test-management/test-plan.js";
import type { SavedQuery } from "../../domain/queries/saved-query.js";

const ADO_CSRF_META_SELECTOR = 'meta[name="ado-csrf-token"]';
const ADO_CSRF_HEADER = "x-ado-csrf-token";

export type AdoContext = { organization: string; project: string };

export type ListSetsResponse = { sets: Set[]; activeSetId: string | null };

/**
 * Thin HTTP wrapper for the local server's `/phase2/*` endpoints.
 *
 * The browser cannot read the CSRF token from a cookie (the local server
 * doesn't issue one); instead, the token is embedded in a `<meta>` tag the
 * server inlines into the bootstrap HTML. The wrapper reads that meta tag
 * lazily so a tab refresh after a server restart picks the new token up.
 *
 * Errors throw {@link ApiError} with the server-supplied `code` so feature
 * code can branch on `ADO_CONTEXT_NOT_CONFIGURED` etc. without parsing
 * messages.
 */
export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getAdoContext(): Promise<AdoContext | null> {
  const payload = await jsonFetch<{ context: AdoContext | null }>("/phase2/ado-context", { method: "GET" });
  return payload.context;
}

export async function setAdoContext(context: AdoContext): Promise<AdoContext> {
  const payload = await jsonFetch<{ context: AdoContext }>("/phase2/ado-context", {
    method: "POST",
    body: context
  });
  return payload.context;
}

export async function listSets(): Promise<ListSetsResponse> {
  return jsonFetch<ListSetsResponse>("/phase2/sets", { method: "GET" });
}

export async function createSetRequest(
  draft: SetDraft & { setActive?: boolean }
): Promise<Set> {
  const payload = await jsonFetch<{ set: Set }>("/phase2/sets", {
    method: "POST",
    body: draft
  });
  return payload.set;
}

export async function updateSetRequest(
  setId: string,
  patch: Partial<SetDraft>
): Promise<Set> {
  const payload = await jsonFetch<{ set: Set }>(`/phase2/sets/${encodeURIComponent(setId)}`, {
    method: "PATCH",
    body: patch
  });
  return payload.set;
}

export async function deleteSetRequest(setId: string): Promise<void> {
  await jsonFetch<{ status: string }>(`/phase2/sets/${encodeURIComponent(setId)}`, {
    method: "DELETE"
  });
}

export async function setActiveSetRequest(setId: string | null): Promise<void> {
  await jsonFetch<{ activeSetId: string | null }>("/phase2/active-set", {
    method: "POST",
    body: { setId }
  });
}

export async function listTestPlans(): Promise<TestPlanSummary[]> {
  const payload = await jsonFetch<{ plans: TestPlanSummary[] }>("/phase2/test-plans", { method: "GET" });
  return payload.plans;
}

export async function listSuitesForPlan(planId: number): Promise<TestSuiteSummary[]> {
  const payload = await jsonFetch<{ suites: TestSuiteSummary[] }>(
    `/phase2/test-plans/${planId}/suites`,
    { method: "GET" }
  );
  return payload.suites;
}

export async function listSavedQueries(): Promise<SavedQuery[]> {
  const payload = await jsonFetch<{ queries: SavedQuery[] }>("/phase2/saved-queries", { method: "GET" });
  return payload.queries;
}

export type RelationLinkRequest = { sourceId: number; targetId: number };

export async function createRelationRequest(link: RelationLinkRequest): Promise<void> {
  await jsonFetch<{ status: string }>("/phase2/relations", { method: "POST", body: link });
}

export async function deleteRelationRequest(link: RelationLinkRequest): Promise<void> {
  await jsonFetch<{ status: string }>("/phase2/relations", { method: "DELETE", body: link });
}

type FetchInit = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

async function jsonFetch<T>(url: string, init: FetchInit): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (init.method !== "GET") {
    const csrfToken = readCsrfTokenFromMeta();
    if (csrfToken) {
      headers[ADO_CSRF_HEADER] = csrfToken;
    }
  }

  const response = await fetch(url, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const code =
      parsed && typeof parsed === "object" && typeof (parsed as { code?: unknown }).code === "string"
        ? (parsed as { code: string }).code
        : `HTTP_${response.status}`;
    const message =
      parsed && typeof parsed === "object" && typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, code, message);
  }

  return (parsed as T) ?? ({} as T);
}

function readCsrfTokenFromMeta(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const meta = document.querySelector(ADO_CSRF_META_SELECTOR);
  if (!(meta instanceof HTMLMetaElement)) {
    return null;
  }
  const token = meta.content.trim();
  return token.length > 0 ? token : null;
}
