// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useAdoContext } from "./use-ado-context.js";
import {
  WithClientPorts,
  buildClientPortsStub
} from "../../app/composition/test-client-ports.js";
import { ApiError } from "../../application/dto/api-error.js";
import type { AdoContext } from "../../application/ports/ado-context.port.js";
import type { AdoContextClientPort } from "../../application/ports/client/ado-context-client.port.js";
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

describe("useAdoContext", () => {
  let getContext: ReturnType<typeof vi.fn>;
  let setContext: ReturnType<typeof vi.fn>;
  let getCliDefaults: ReturnType<typeof vi.fn>;
  let adoContext: AdoContextClientPort;
  let ports: ClientPorts;

  beforeEach(() => {
    getContext = vi.fn(async () => null as AdoContext | null);
    setContext = vi.fn(async (ctx: AdoContext) => ctx);
    getCliDefaults = vi.fn(async () => ({ organization: "", project: "" }));
    adoContext = {
      getContext: getContext as unknown as AdoContextClientPort["getContext"],
      setContext: setContext as unknown as AdoContextClientPort["setContext"],
      getCliDefaults: getCliDefaults as unknown as AdoContextClientPort["getCliDefaults"]
    };
    ports = buildClientPortsStub({ adoContext });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in CHECKING state, then reflects an empty context as hasContext=false", async () => {
    const harness = setupHook(() => useAdoContext(), ports);

    expect(harness.result.current.isLoading).toBe(true);
    expect(harness.result.current.hasContext).toBe(false);

    await flushAsync();

    expect(harness.result.current.isLoading).toBe(false);
    expect(harness.result.current.context).toBeNull();
    expect(harness.result.current.hasContext).toBe(false);
    expect(harness.result.current.error).toBeNull();

    harness.unmount();
  });

  it("reflects a loaded context as hasContext=true", async () => {
    getContext.mockResolvedValue({
      organization: "tensorfive",
      project: "AzureTestOps"
    });

    const harness = setupHook(() => useAdoContext(), ports);
    await flushAsync();

    expect(harness.result.current.context).toEqual({
      organization: "tensorfive",
      project: "AzureTestOps"
    });
    expect(harness.result.current.hasContext).toBe(true);
    expect(harness.result.current.error).toBeNull();

    harness.unmount();
  });

  it("captures the error message when the initial load fails", async () => {
    getContext.mockRejectedValue(new Error("network down"));

    const harness = setupHook(() => useAdoContext(), ports);
    await flushAsync();

    expect(harness.result.current.isLoading).toBe(false);
    expect(harness.result.current.context).toBeNull();
    expect(harness.result.current.hasContext).toBe(false);
    expect(harness.result.current.error).toBe("network down");

    harness.unmount();
  });

  it("save persists the context, clears the error and updates state immediately", async () => {
    const harness = setupHook(() => useAdoContext(), ports);
    await flushAsync();

    let saved: AdoContext | undefined;
    await act(async () => {
      saved = await harness.result.current.save({
        organization: "tensorfive",
        project: "AzureTestOps"
      });
    });

    expect(saved).toEqual({ organization: "tensorfive", project: "AzureTestOps" });
    expect(setContext).toHaveBeenCalledWith({
      organization: "tensorfive",
      project: "AzureTestOps"
    });
    expect(harness.result.current.hasContext).toBe(true);
    expect(harness.result.current.error).toBeNull();

    harness.unmount();
  });

  it("save surfaces ApiError messages without mutating context", async () => {
    getContext.mockResolvedValue({
      organization: "old-org",
      project: "old-project"
    });
    setContext.mockRejectedValue(new ApiError(409, "ADO_CONTEXT_CONFLICT", "context already taken"));

    const harness = setupHook(() => useAdoContext(), ports);
    await flushAsync();

    await act(async () => {
      await expect(
        harness.result.current.save({ organization: "new", project: "new" })
      ).rejects.toBeInstanceOf(ApiError);
    });

    expect(harness.result.current.error).toBe("context already taken");
    expect(harness.result.current.context).toEqual({
      organization: "old-org",
      project: "old-project"
    });

    harness.unmount();
  });

  it("refresh re-runs the load and replaces the cached context", async () => {
    getContext
      .mockResolvedValueOnce({ organization: "first", project: "first" })
      .mockResolvedValueOnce({ organization: "second", project: "second" });

    const harness = setupHook(() => useAdoContext(), ports);
    await flushAsync();

    expect(harness.result.current.context).toEqual({
      organization: "first",
      project: "first"
    });

    await act(async () => {
      await harness.result.current.refresh();
    });

    expect(harness.result.current.context).toEqual({
      organization: "second",
      project: "second"
    });

    harness.unmount();
  });
});
