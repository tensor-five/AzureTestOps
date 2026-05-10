export type HttpResponseLike = {
  status: number;
  json?: unknown;
  headers?: Record<string, string | undefined>;
};

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Allows tests to skip the actual `setTimeout` waits. */
  sleep?: (ms: number) => Promise<void>;
};

export type RetryResult<T extends HttpResponseLike> = {
  response: T;
  attempts: number;
  retried: number;
};

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 4000;

/**
 * Retries a request when the response is a transient HTTP failure (408, 429,
 * 502, 503, 504) or the request itself throws a transient transport error.
 * Honors `Retry-After` if present, otherwise uses exponential backoff with
 * deterministic jitter for stability in tests.
 */
export async function requestWithRetry<T extends HttpResponseLike>(
  request: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  let retried = 0;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await request();

      if (!isTransientStatus(response.status)) {
        return { response, attempts: attempt, retried };
      }

      if (attempt >= maxAttempts) {
        return { response, attempts: attempt, retried };
      }

      retried += 1;
      const retryAfterMs = parseRetryAfterMilliseconds(response.headers?.["retry-after"]);
      await sleep(computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (!isTransientError(error)) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        throw error;
      }

      retried += 1;
      await sleep(computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs));
    }
  }

  // unreachable, but keeps the compiler happy
  throw lastError instanceof Error ? lastError : new Error("requestWithRetry: exhausted without response");
}

export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /(econn|etimedout|network|fetch|timeout|socket)/i.test(error.message);
}

export function parseRetryAfterMilliseconds(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return undefined;
}

export function computeBackoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  retryAfterMs?: number
): number {
  if (typeof retryAfterMs === "number" && retryAfterMs >= 0) {
    return retryAfterMs;
  }
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  const deterministicJitter = (attempt * 37) % 100;
  return exponential + deterministicJitter;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
