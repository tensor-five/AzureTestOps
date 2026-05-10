import { describe, expect, it } from "vitest";

import {
  computeBackoffDelayMs,
  isTransientError,
  isTransientStatus,
  parseRetryAfterMilliseconds,
  requestWithRetry
} from "./retry.js";

describe("retry helpers", () => {
  it("classifies transient HTTP statuses", () => {
    expect(isTransientStatus(408)).toBe(true);
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(502)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
    expect(isTransientStatus(504)).toBe(true);
    expect(isTransientStatus(200)).toBe(false);
    expect(isTransientStatus(404)).toBe(false);
  });

  it("classifies transient transport errors by message", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("network failure"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("nope"))).toBe(false);
    expect(isTransientError("not an error")).toBe(false);
  });

  it("parses Retry-After in seconds", () => {
    expect(parseRetryAfterMilliseconds("3")).toBe(3000);
    expect(parseRetryAfterMilliseconds("0")).toBe(0);
    expect(parseRetryAfterMilliseconds(undefined)).toBeUndefined();
    expect(parseRetryAfterMilliseconds("not-a-number")).toBeUndefined();
  });

  it("uses Retry-After when provided, otherwise exponential", () => {
    expect(computeBackoffDelayMs(1, 250, 4000, 5000)).toBe(5000);
    expect(computeBackoffDelayMs(1, 250, 4000)).toBe(250 + 37);
    expect(computeBackoffDelayMs(2, 250, 4000)).toBe(500 + 74);
    expect(computeBackoffDelayMs(10, 250, 4000)).toBe(4000 + 70);
  });
});

describe("requestWithRetry", () => {
  it("returns the first non-transient response without retry", async () => {
    const calls: number[] = [];
    const result = await requestWithRetry(
      async () => {
        calls.push(1);
        return { status: 200, json: { ok: true } };
      },
      { sleep: async () => undefined }
    );

    expect(calls).toHaveLength(1);
    expect(result.response.status).toBe(200);
    expect(result.retried).toBe(0);
  });

  it("retries on 503 then succeeds", async () => {
    let attempt = 0;
    const result = await requestWithRetry(
      async () => {
        attempt += 1;
        if (attempt < 3) {
          return { status: 503, headers: {} };
        }
        return { status: 200, json: { ok: true } };
      },
      { sleep: async () => undefined }
    );

    expect(attempt).toBe(3);
    expect(result.retried).toBe(2);
    expect(result.response.status).toBe(200);
  });

  it("returns the last transient response after exhausting attempts", async () => {
    let attempt = 0;
    const result = await requestWithRetry(
      async () => {
        attempt += 1;
        return { status: 429, headers: { "retry-after": "0" } };
      },
      { sleep: async () => undefined, maxAttempts: 3 }
    );

    expect(attempt).toBe(3);
    expect(result.response.status).toBe(429);
  });

  it("rethrows non-transient errors immediately", async () => {
    let attempt = 0;
    await expect(
      requestWithRetry(
        async () => {
          attempt += 1;
          throw new Error("permanent failure");
        },
        { sleep: async () => undefined }
      )
    ).rejects.toThrow("permanent failure");

    expect(attempt).toBe(1);
  });

  it("retries on transient errors", async () => {
    let attempt = 0;
    const result = await requestWithRetry(
      async () => {
        attempt += 1;
        if (attempt < 2) {
          throw new Error("ECONNRESET");
        }
        return { status: 200 };
      },
      { sleep: async () => undefined }
    );

    expect(attempt).toBe(2);
    expect(result.retried).toBe(1);
  });
});
