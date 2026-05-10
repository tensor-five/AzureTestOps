import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import type {
  ActiveSetSnapshotClientPort,
  ActiveSetSnapshotStreamEvent,
  ActiveSetSnapshotStreamSubscription
} from "../../application/ports/client/active-set-snapshot-client.port.js";
import type { SnapshotProgressEvent } from "../../application/use-cases/load-active-set-snapshot.use-case.js";

/**
 * Server-Sent Events adapter implementing {@link ActiveSetSnapshotClientPort}.
 *
 * Subscribes to `/phase2/active-set/snapshot/stream`, normalizes the named
 * events into the port's typed envelope, and exposes a teardown handle for
 * deterministic cleanup when the user triggers another refresh mid-flight.
 */
export class SseActiveSetSnapshotAdapter implements ActiveSetSnapshotClientPort {
  public subscribe(
    setId: string,
    onEvent: (event: ActiveSetSnapshotStreamEvent) => void
  ): ActiveSetSnapshotStreamSubscription {
    if (typeof EventSource === "undefined") {
      onEvent({ type: "error", message: "SSE not supported in this environment." });
      return { close: () => undefined };
    }

    const source = new EventSource(
      `/phase2/active-set/snapshot/stream?setId=${encodeURIComponent(setId)}`
    );
    let closed = false;

    const close = (): void => {
      if (closed) return;
      closed = true;
      source.close();
    };

    source.addEventListener("progress", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as SnapshotProgressEvent;
        onEvent({ type: "progress", progress: data });
      } catch {
        // Ignore malformed events — nothing actionable client-side.
      }
    });

    source.addEventListener("result", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { snapshot: ActiveSetSnapshot };
        onEvent({ type: "result", snapshot: payload.snapshot });
      } catch {
        onEvent({ type: "error", message: "Received malformed snapshot result." });
      } finally {
        close();
      }
    });

    source.addEventListener("error", (event) => {
      const message = readErrorMessage(event) ?? "Snapshot stream failed.";
      onEvent({ type: "error", message });
      close();
    });

    source.onerror = () => {
      onEvent({ type: "error", message: "Snapshot stream connection lost." });
      close();
    };

    return { close };
  }
}

function readErrorMessage(event: Event): string | null {
  if (event instanceof MessageEvent && typeof event.data === "string" && event.data.length > 0) {
    try {
      const parsed = JSON.parse(event.data) as { code?: unknown; message?: unknown };
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
      if (typeof parsed.code === "string") {
        return parsed.code;
      }
    } catch {
      return event.data;
    }
  }
  return null;
}
