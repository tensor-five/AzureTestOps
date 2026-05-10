/**
 * Transport-agnostic error surfaced to the application layer when the
 * underlying client-side adapter (HTTP today) returns a structured failure.
 *
 * `code` is the server-supplied error code so feature code can branch
 * without parsing messages; `status` mirrors the HTTP status when an HTTP
 * adapter raised it, and is left as `0` when the failure originated outside
 * a transport (e.g. malformed payload).
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
