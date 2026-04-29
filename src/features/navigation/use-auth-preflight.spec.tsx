// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useAuthPreflight } from "./use-auth-preflight.js";
import type { PreflightStatus } from "./header.js";

function setupHook<T>(useHook: () => T): {
  result: { current: T };
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = { current: undefined as unknown as T };

  function Capture(): React.ReactElement | null {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(<Capture />);
  });

  return {
    result,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("useAuthPreflight", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts in CHECKING then transitions to the server-reported status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: { status: "READY" } }));

    const harness = setupHook(() => useAuthPreflight());
    expect(harness.result.current).toBe<PreflightStatus>("CHECKING");

    await flushAsync();

    expect(harness.result.current).toBe<PreflightStatus>("READY");
    expect(fetchMock).toHaveBeenCalledWith(
      "/phase2/auth-preflight",
      expect.objectContaining({ headers: { accept: "application/json" } })
    );

    harness.unmount();
  });

  it("falls back to UNKNOWN_ERROR when the response is not OK", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

    const harness = setupHook(() => useAuthPreflight());
    await flushAsync();

    expect(harness.result.current).toBe<PreflightStatus>("UNKNOWN_ERROR");

    harness.unmount();
  });

  it("falls back to UNKNOWN_ERROR when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    const harness = setupHook(() => useAuthPreflight());
    await flushAsync();

    expect(harness.result.current).toBe<PreflightStatus>("UNKNOWN_ERROR");

    harness.unmount();
  });

  it("ignores a late response after unmount instead of warning about state on an unmounted component", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));

    const harness = setupHook(() => useAuthPreflight());
    harness.unmount();

    resolveFetch?.(jsonResponse({ result: { status: "READY" } }));
    // Flushing must not throw — the cancellation flag inside the hook should
    // swallow the response.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
