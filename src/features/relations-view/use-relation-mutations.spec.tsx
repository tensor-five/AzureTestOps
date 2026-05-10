// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { useRelationMutations, type RelationMutationsApi } from "./use-relation-mutations.js";
import {
  WithClientPorts,
  buildClientPortsStub
} from "../../app/composition/test-client-ports.js";

type Harness = {
  result: { current: RelationMutationsApi };
  rerender(props: { snapshotKey: string | null; relations: Set<string> }): void;
  unmount(): void;
};

function relationKeyForSnapshot(tc: number, wi: number): string {
  return `${tc}::${wi}`;
}

function renderHook(
  initial: { snapshotKey: string | null; relations: Set<string> },
  overrides: {
    createRelation: (link: { sourceId: number; targetId: number }) => Promise<void>;
    deleteRelation: (link: { sourceId: number; targetId: number }) => Promise<void>;
  }
): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const result = { current: undefined as unknown as RelationMutationsApi };
  const ports = buildClientPortsStub({
    relationMutations: {
      add: overrides.createRelation,
      remove: overrides.deleteRelation
    }
  });

  let currentProps = initial;

  function Capture(): React.ReactElement {
    result.current = useRelationMutations({
      snapshotKey: currentProps.snapshotKey,
      isRelatedInSnapshot: (tc, wi) => currentProps.relations.has(relationKeyForSnapshot(tc, wi)),
      createRelation: overrides.createRelation,
      deleteRelation: overrides.deleteRelation
    });
    return <div />;
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
    rerender(next) {
      currentProps = next;
      act(() => {
        root.render(
          <WithClientPorts ports={ports}>
            <Capture />
          </WithClientPorts>
        );
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

type MutationFn = (link: { sourceId: number; targetId: number }) => Promise<void>;

describe("useRelationMutations", () => {
  let createSpy: ReturnType<typeof vi.fn<MutationFn>>;
  let deleteSpy: ReturnType<typeof vi.fn<MutationFn>>;

  beforeEach(() => {
    createSpy = vi.fn<MutationFn>(async () => undefined);
    deleteSpy = vi.fn<MutationFn>(async () => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reflects snapshot truth when no overrides have been applied", () => {
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set([relationKeyForSnapshot(1, 2)]) },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    expect(harness.result.current.isRelated(1, 2)).toBe(true);
    expect(harness.result.current.isRelated(1, 3)).toBe(false);

    harness.unmount();
  });

  it("optimistically reports added relations and calls the create endpoint", async () => {
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.addRelation(11, 22);
    });

    expect(createSpy).toHaveBeenCalledWith({ sourceId: 11, targetId: 22 });
    expect(harness.result.current.isRelated(11, 22)).toBe(true);
    expect(harness.result.current.error).toBeNull();

    harness.unmount();
  });

  it("rolls back the optimistic add when the API rejects", async () => {
    createSpy.mockRejectedValueOnce(new Error("boom"));

    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.addRelation(11, 22);
    });

    expect(harness.result.current.isRelated(11, 22)).toBe(false);
    expect(harness.result.current.error).toBe("boom");

    act(() => {
      harness.result.current.clearError();
    });
    expect(harness.result.current.error).toBeNull();

    harness.unmount();
  });

  it("optimistically removes a snapshot relation and calls the delete endpoint", async () => {
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set([relationKeyForSnapshot(1, 2)]) },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.removeRelation(1, 2);
    });

    expect(deleteSpy).toHaveBeenCalledWith({ sourceId: 1, targetId: 2 });
    expect(harness.result.current.isRelated(1, 2)).toBe(false);

    harness.unmount();
  });

  it("rolls back the optimistic remove when the API rejects", async () => {
    deleteSpy.mockRejectedValueOnce(new Error("nope"));

    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set([relationKeyForSnapshot(1, 2)]) },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.removeRelation(1, 2);
    });

    expect(harness.result.current.isRelated(1, 2)).toBe(true);
    expect(harness.result.current.error).toBe("nope");

    harness.unmount();
  });

  it("ignores duplicate adds when the relation is already present", async () => {
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set([relationKeyForSnapshot(1, 2)]) },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.addRelation(1, 2);
    });

    expect(createSpy).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("ignores removes for relations that aren't present", async () => {
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.removeRelation(7, 8);
    });

    expect(deleteSpy).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("ignores invalid (non-positive or self) links", async () => {
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.addRelation(0, 5);
      await harness.result.current.addRelation(5, 5);
    });

    expect(createSpy).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("clears overrides when the snapshotKey changes", async () => {
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.addRelation(11, 22);
    });
    expect(harness.result.current.isRelated(11, 22)).toBe(true);

    harness.rerender({ snapshotKey: "s2", relations: new Set() });

    expect(harness.result.current.isRelated(11, 22)).toBe(false);

    harness.unmount();
  });

  it("marks a relation as pending while the request is in flight", async () => {
    let resolveCreate: (() => void) | null = null;
    createSpy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        })
    );

    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let pendingDuringFlight = false;
    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = harness.result.current.addRelation(11, 22);
    });

    pendingDuringFlight = harness.result.current.isPending(11, 22);

    await act(async () => {
      resolveCreate?.();
      await promise;
    });

    expect(pendingDuringFlight).toBe(true);
    expect(harness.result.current.isPending(11, 22)).toBe(false);

    harness.unmount();
  });
});
