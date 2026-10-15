import type { ActiveSetSnapshot } from "../../application/dto/active-set-snapshot.dto.js";
import type {
  ActiveSetSnapshotClientPort,
  ActiveSetSnapshotStreamEvent,
  ActiveSetSnapshotStreamSubscription
} from "../../application/ports/client/active-set-snapshot-client.port.js";
import type { SnapshotProgressEvent } from "../../application/use-cases/load-active-set-snapshot.use-case.js";
import { createViewReadDiagnostics } from '../../shared/diagnostics/view-read-diagnostics.js';

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

    const requestId = crypto.randomUUID();
    const diagnostics = createViewReadDiagnostics('relations', requestId, 'browser');
    let source: EventSource;
    try {
      source = new EventSource(
        `/phase2/active-set/snapshot/stream?setId=${encodeURIComponent(setId)}&requestId=${requestId}`
      );
    } catch (error) { diagnostics.finish('error'); throw error; }
    let closed = false;

    const close = (): void => {
      if (closed) return;
      closed = true;
      diagnostics.finish('aborted');
      source.close();
    };

    source.addEventListener("cached", (event) => {
      if (closed) return;
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { snapshot?: ActiveSetSnapshot };
        const snapshot = payload.snapshot;
        if (!snapshot?.set || !snapshot.suiteTree || !Array.isArray(snapshot.projections)
          || !Array.isArray(snapshot.workItemsFromQuery) || typeof snapshot.loadedAt !== 'string') return;
        diagnostics.addCount('snapshotPreviewHits');
        onEvent({ type: "cached", snapshot });
      } catch { /* An unusable preview never interrupts the authoritative fresh read. */ }
    });

    source.addEventListener("progress", (event) => {
      if (closed) return;
      try {
        const data = JSON.parse((event as MessageEvent).data) as SnapshotProgressEvent;
        diagnostics.phase(data.stage, data.done === data.total);
        onEvent({ type: "progress", progress: data });
      } catch {
        // Ignore malformed events — nothing actionable client-side.
      }
    });

    source.addEventListener("result", (event) => {
      if (closed) return;
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { snapshot: ActiveSetSnapshot };
        diagnostics.progress({ projectionCount: payload.snapshot.projections.length, queryWorkItemCount: payload.snapshot.workItemsFromQuery.length });
        diagnostics.finish('complete');
        onEvent({ type: "result", snapshot: payload.snapshot });
      } catch {
        diagnostics.finish('error');
        onEvent({ type: "error", message: "Received malformed snapshot result." });
      } finally {
        close();
      }
    });

    source.addEventListener("error", (event) => {
      if (closed) return;
      diagnostics.finish('error');
      const message = readErrorMessage(event) ?? "Snapshot stream failed.";
      onEvent({ type: "error", message });
      close();
    });

    source.onerror = () => {
      if (closed) return;
      diagnostics.finish('error');
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
