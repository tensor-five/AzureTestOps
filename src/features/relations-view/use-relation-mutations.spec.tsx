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
      snapshotRelations: currentProps.relations,
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
    expect(harness.result.current.relationIndex.workItemIdsByTestCaseId.get(1))
      .toEqual(new Set([2]));

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

  it("releases the relation queue when an adapter throws synchronously", async () => {
    createSpy
      .mockImplementationOnce(() => {
        throw new Error("sync boom");
      })
      .mockResolvedValueOnce(undefined);
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.addRelation(11, 22);
    });
    expect(harness.result.current.isPending(11, 22)).toBe(false);
    expect(harness.result.current.error).toBe("sync boom");

    await act(async () => {
      await harness.result.current.addRelation(11, 22);
    });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(harness.result.current.isRelated(11, 22)).toBe(true);
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

  it("serializes a queued remove after a pending add", async () => {
    let resolveCreate!: () => void;
    let resolveDelete!: () => void;
    createSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveCreate = resolve;
    }));
    deleteSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }));
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let addPromise = Promise.resolve();
    let removePromise = Promise.resolve();
    act(() => {
      addPromise = harness.result.current.addRelation(11, 22);
    });
    act(() => {
      removePromise = harness.result.current.removeRelation(11, 22);
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(harness.result.current.isPending(11, 22)).toBe(true);
    expect(harness.result.current.isRelated(11, 22)).toBe(false);

    await act(async () => {
      resolveCreate();
      await Promise.resolve();
    });
    expect(deleteSpy).toHaveBeenCalledWith({ sourceId: 11, targetId: 22 });
    expect(harness.result.current.isPending(11, 22)).toBe(true);

    await act(async () => {
      resolveDelete();
      await addPromise;
      await removePromise;
    });
    expect(harness.result.current.isPending(11, 22)).toBe(false);
    expect(harness.result.current.isRelated(11, 22)).toBe(false);
    expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(
      deleteSpy.mock.invocationCallOrder[0]
    );
    harness.unmount();
  });

  it("serializes a queued add after a pending remove", async () => {
    let resolveDelete!: () => void;
    let resolveCreate!: () => void;
    deleteSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }));
    createSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveCreate = resolve;
    }));
    const harness = renderHook(
      {
        snapshotKey: "s1",
        relations: new Set([relationKeyForSnapshot(11, 22)])
      },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let removePromise = Promise.resolve();
    let addPromise = Promise.resolve();
    act(() => {
      removePromise = harness.result.current.removeRelation(11, 22);
    });
    act(() => {
      addPromise = harness.result.current.addRelation(11, 22);
    });

    expect(createSpy).not.toHaveBeenCalled();
    expect(harness.result.current.isRelated(11, 22)).toBe(true);

    await act(async () => {
      resolveDelete();
      await Promise.resolve();
    });
    expect(createSpy).toHaveBeenCalledWith({ sourceId: 11, targetId: 22 });

    await act(async () => {
      resolveCreate();
      await removePromise;
      await addPromise;
    });
    expect(harness.result.current.isPending(11, 22)).toBe(false);
    expect(harness.result.current.isRelated(11, 22)).toBe(true);
    expect(deleteSpy.mock.invocationCallOrder[0]).toBeLessThan(
      createSpy.mock.invocationCallOrder[0]
    );
    harness.unmount();
  });

  it("keeps the same relation serialized across snapshot generations", async () => {
    let resolveOldAdd!: () => void;
    createSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveOldAdd = resolve;
    }));
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let oldAdd = Promise.resolve();
    act(() => {
      oldAdd = harness.result.current.addRelation(11, 22);
    });
    harness.rerender({
      snapshotKey: "s2",
      relations: new Set([relationKeyForSnapshot(11, 22)])
    });

    let queuedRemove = Promise.resolve();
    act(() => {
      queuedRemove = harness.result.current.removeRelation(11, 22);
    });
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(harness.result.current.isPending(11, 22)).toBe(true);

    await act(async () => {
      resolveOldAdd();
      await oldAdd;
      await queuedRemove;
    });
    expect(harness.result.current.isPending(11, 22)).toBe(false);
    expect(deleteSpy).toHaveBeenCalledWith({ sourceId: 11, targetId: 22 });
    expect(harness.result.current.isRelated(11, 22)).toBe(false);
    expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(
      deleteSpy.mock.invocationCallOrder[0]
    );
    harness.unmount();
  });

  it("retries the same add intent when the older snapshot request fails", async () => {
    let rejectOldAdd!: (error: Error) => void;
    createSpy
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectOldAdd = reject;
      }))
      .mockResolvedValueOnce(undefined);
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let oldAdd = Promise.resolve();
    let currentAdd = Promise.resolve();
    act(() => {
      oldAdd = harness.result.current.addRelation(11, 22);
    });
    harness.rerender({ snapshotKey: "s2", relations: new Set() });
    act(() => {
      currentAdd = harness.result.current.addRelation(11, 22);
    });
    expect(createSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectOldAdd(new Error("old add failed"));
      await oldAdd;
      await currentAdd;
    });

    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(harness.result.current.isRelated(11, 22)).toBe(true);
    expect(harness.result.current.isPending(11, 22)).toBe(false);
    expect(harness.result.current.error).toBeNull();
    harness.unmount();
  });

  it("retries the same delete intent when the older snapshot request fails", async () => {
    let rejectOldDelete!: (error: Error) => void;
    deleteSpy
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectOldDelete = reject;
      }))
      .mockResolvedValueOnce(undefined);
    const relation = relationKeyForSnapshot(11, 22);
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set([relation]) },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let oldDelete = Promise.resolve();
    let currentDelete = Promise.resolve();
    act(() => {
      oldDelete = harness.result.current.removeRelation(11, 22);
    });
    harness.rerender({ snapshotKey: "s2", relations: new Set([relation]) });
    act(() => {
      currentDelete = harness.result.current.removeRelation(11, 22);
    });
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectOldDelete(new Error("old delete failed"));
      await oldDelete;
      await currentDelete;
    });

    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(harness.result.current.isRelated(11, 22)).toBe(false);
    expect(harness.result.current.isPending(11, 22)).toBe(false);
    expect(harness.result.current.error).toBeNull();
    harness.unmount();
  });

  it("projects a successful add onto stale snapshots until Azure confirms it", async () => {
    let resolveOldAdd!: () => void;
    createSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveOldAdd = resolve;
    }));
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let oldAdd = Promise.resolve();
    act(() => {
      oldAdd = harness.result.current.addRelation(11, 22);
    });
    harness.rerender({ snapshotKey: "s2", relations: new Set() });
    expect(harness.result.current.isRelated(11, 22)).toBe(false);

    let repeatedAdd = Promise.resolve();
    act(() => {
      repeatedAdd = harness.result.current.addRelation(11, 22);
    });

    await act(async () => {
      resolveOldAdd();
      await oldAdd;
      await repeatedAdd;
    });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(harness.result.current.isRelated(11, 22)).toBe(true);

    harness.rerender({ snapshotKey: "s3", relations: new Set() });
    expect(harness.result.current.isRelated(11, 22)).toBe(true);

    await act(async () => {
      await harness.result.current.addRelation(11, 22);
    });
    expect(createSpy).toHaveBeenCalledTimes(1);

    harness.rerender({
      snapshotKey: "s4",
      relations: new Set([relationKeyForSnapshot(11, 22)])
    });
    expect(harness.result.current.isRelated(11, 22)).toBe(true);
    harness.unmount();
  });

  it("projects a successful delete onto stale snapshots without duplicate removes", async () => {
    let resolveOldDelete!: () => void;
    deleteSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveOldDelete = resolve;
    }));
    const relation = relationKeyForSnapshot(11, 22);
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set([relation]) },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let oldDelete = Promise.resolve();
    act(() => {
      oldDelete = harness.result.current.removeRelation(11, 22);
    });
    harness.rerender({ snapshotKey: "s2", relations: new Set([relation]) });
    expect(harness.result.current.isRelated(11, 22)).toBe(true);

    await act(async () => {
      resolveOldDelete();
      await oldDelete;
    });
    expect(harness.result.current.isRelated(11, 22)).toBe(false);

    harness.rerender({ snapshotKey: "s3", relations: new Set([relation]) });
    expect(harness.result.current.isRelated(11, 22)).toBe(false);

    await act(async () => {
      await harness.result.current.removeRelation(11, 22);
    });
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    harness.rerender({ snapshotKey: "s4", relations: new Set() });
    expect(harness.result.current.isRelated(11, 22)).toBe(false);
    harness.unmount();
  });

  it("restores the last confirmed effect when the opposite mutation fails", async () => {
    deleteSpy.mockRejectedValueOnce(new Error("delete failed"));
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    await act(async () => {
      await harness.result.current.addRelation(11, 22);
    });
    expect(harness.result.current.isRelated(11, 22)).toBe(true);

    await act(async () => {
      await harness.result.current.removeRelation(11, 22);
    });

    expect(harness.result.current.isRelated(11, 22)).toBe(true);
    expect(harness.result.current.error).toBe("delete failed");
    harness.unmount();
  });

  it("ignores state changes from an older snapshot settlement", async () => {
    let rejectOldAdd!: (error: Error) => void;
    let resolveCurrentDelete!: () => void;
    createSpy.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectOldAdd = reject;
    }));
    deleteSpy.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveCurrentDelete = resolve;
    }));
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let oldAdd = Promise.resolve();
    act(() => {
      oldAdd = harness.result.current.addRelation(11, 22);
    });
    harness.rerender({
      snapshotKey: "s2",
      relations: new Set([relationKeyForSnapshot(33, 44)])
    });

    let currentDelete = Promise.resolve();
    act(() => {
      currentDelete = harness.result.current.removeRelation(33, 44);
    });
    expect(harness.result.current.isRelated(33, 44)).toBe(false);
    expect(harness.result.current.isPending(33, 44)).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith({ sourceId: 33, targetId: 44 });

    await act(async () => {
      rejectOldAdd(new Error("stale add failed"));
      await oldAdd;
    });

    expect(harness.result.current.isRelated(33, 44)).toBe(false);
    expect(harness.result.current.isPending(33, 44)).toBe(true);
    expect(harness.result.current.isPending(11, 22)).toBe(false);
    expect(harness.result.current.error).toBeNull();

    await act(async () => {
      resolveCurrentDelete();
      await currentDelete;
    });
    expect(harness.result.current.isPending(33, 44)).toBe(false);
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

  it("clears an in-flight optimistic override when the snapshotKey changes", async () => {
    let rejectCreate!: (error: Error) => void;
    createSpy.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectCreate = reject;
    }));
    const harness = renderHook(
      { snapshotKey: "s1", relations: new Set() },
      { createRelation: createSpy, deleteRelation: deleteSpy }
    );

    let addPromise = Promise.resolve();
    act(() => {
      addPromise = harness.result.current.addRelation(11, 22);
    });
    expect(harness.result.current.isRelated(11, 22)).toBe(true);

    harness.rerender({ snapshotKey: "s2", relations: new Set() });

    expect(harness.result.current.isRelated(11, 22)).toBe(false);

    await act(async () => {
      rejectCreate(new Error("stale request failed"));
      await addPromise;
    });
    expect(harness.result.current.error).toBeNull();

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
