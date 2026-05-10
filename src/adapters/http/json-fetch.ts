import { ApiError } from "../../application/dto/api-error.js";
import { readCsrfTokenFromMeta } from "./csrf-token-reader.js";

const ADO_CSRF_HEADER = "x-ado-csrf-token";

export type JsonFetchInit = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

/**
 * Shared JSON-over-HTTP transport for every browser-side adapter.
 *
 * Attaches the CSRF token (read from the `<meta>` tag) on mutating requests
 * only — GET stays cacheable. Errors throw {@link ApiError} carrying the
 * server-supplied `code` so callers can branch on
 * `ADO_CONTEXT_NOT_CONFIGURED` etc. without parsing message strings.
 */
export async function jsonFetch<T>(url: string, init: JsonFetchInit): Promise<T> {
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
