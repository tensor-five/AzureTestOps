// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useAuthPreflight } from "./use-auth-preflight.js";
import type { PreflightStatus } from "./header.js";
import {
  WithClientPorts,
  buildClientPortsStub
} from "../../app/composition/test-client-ports.js";
import type { AuthPreflightClientPort } from "../../application/ports/client/auth-preflight-client.port.js";
import type { ClientPorts } from "../../application/ports/client/client-ports.js";

function setupHook<T>(
  useHook: () => T,
  ports: ClientPorts
): {
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
    root.render(
      <WithClientPorts ports={ports}>
        <Capture />
      </WithClientPorts>
    );
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

describe("useAuthPreflight", () => {
  let checkSpy: ReturnType<typeof vi.fn>;
  let authPreflight: AuthPreflightClientPort;
  let ports: ClientPorts;

  beforeEach(() => {
    checkSpy = vi.fn(async () => "READY" as PreflightStatus);
    authPreflight = {
      check: checkSpy as unknown as AuthPreflightClientPort["check"]
    };
    ports = buildClientPortsStub({ authPreflight });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in CHECKING then transitions to the port-reported status", async () => {
    const harness = setupHook(() => useAuthPreflight(), ports);
    expect(harness.result.current).toBe<PreflightStatus>("CHECKING");

    await flushAsync();

    expect(harness.result.current).toBe<PreflightStatus>("READY");
    expect(checkSpy).toHaveBeenCalledTimes(1);

    harness.unmount();
  });

  it("falls back to UNKNOWN_ERROR when the port resolves with UNKNOWN_ERROR", async () => {
    checkSpy.mockResolvedValue("UNKNOWN_ERROR" as PreflightStatus);

    const harness = setupHook(() => useAuthPreflight(), ports);
    await flushAsync();

    expect(harness.result.current).toBe<PreflightStatus>("UNKNOWN_ERROR");

    harness.unmount();
  });

  it("falls back to UNKNOWN_ERROR when the port rejects", async () => {
    checkSpy.mockRejectedValue(new Error("offline"));

    const harness = setupHook(() => useAuthPreflight(), ports);
    await flushAsync();

    expect(harness.result.current).toBe<PreflightStatus>("UNKNOWN_ERROR");

    harness.unmount();
  });

  it("ignores a late response after unmount instead of warning about state on an unmounted component", async () => {
    let resolveCheck: ((status: PreflightStatus) => void) | undefined;
    checkSpy.mockReturnValue(
      new Promise<PreflightStatus>((resolve) => {
        resolveCheck = resolve;
      })
    );

    const harness = setupHook(() => useAuthPreflight(), ports);
    harness.unmount();

    resolveCheck?.("READY");
    // Flushing must not throw — the cancellation flag inside the hook should
    // swallow the response.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
