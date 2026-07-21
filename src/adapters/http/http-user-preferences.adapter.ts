import {
  UserPreferencesClientError,
  type UserPreferencesClientOperation,
  type UserPreferencesClientPort,
  type UserPreferencesSaveStatusListener
} from "../../application/ports/client/user-preferences-client.port.js";
import {
  sanitizeUserPreferences,
  type UserPreferences
} from "../../shared/user-preferences/user-preferences.schema.js";
import { sanitizeKeyedPreferencePatch } from "../../shared/user-preferences/keyed-preference-patch.js";

import { readCsrfTokenFromMeta } from "./csrf-token-reader.js";

const USER_PREFERENCES_ENDPOINT = "/phase2/user-preferences";
const ADO_CSRF_HEADER = "x-ado-csrf-token";
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export type HttpUserPreferencesAdapterOptions = {
  requestTimeoutMs?: number;
};

/**
 * HTTP-backed implementation of {@link UserPreferencesClientPort}.
 *
 * Owns the in-memory `UserPreferences` cache, deduplicates concurrent
 * hydrations and applies the same per-setId merge for `setLayouts` /
 * `setFilters` that the lowdb adapter performs server-side, so the cached
 * snapshot stays consistent across single-set patches.
 */
export class HttpUserPreferencesAdapter implements UserPreferencesClientPort {
  private readonly requestTimeoutMs: number;
  private cache: UserPreferences = {};
  private hydrated = false;
  private hydrationInFlight: Promise<UserPreferences> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private recoveryPatch: UserPreferences | null = null;
  private desiredPatch: UserPreferences | null = null;
  private desiredRevision = 0;
  private readonly saveStatusListeners = new Set<UserPreferencesSaveStatusListener>();

  public constructor(options: HttpUserPreferencesAdapterOptions = {}) {
    this.requestTimeoutMs = normalizeTimeout(options.requestTimeoutMs);
  }

  public getCached(): UserPreferences {
    return this.cache;
  }

  public hydrate(): Promise<UserPreferences> {
    if (this.hydrated) {
      return Promise.resolve(this.cache);
    }
    if (this.hydrationInFlight) {
      return this.hydrationInFlight;
    }

    this.hydrationInFlight = this.loadFromServer()
      .then((next) => {
        this.cache = next;
        this.desiredPatch = null;
        this.hydrated = true;
        return this.cache;
      })
      .catch((error: unknown) => {
        // The cache remains available as a local fallback. Mark hydration as
        // complete so feature stores do not start another blocking request.
        this.hydrated = true;
        throw toClientError("load", error);
      })
      .finally(() => {
        this.hydrationInFlight = null;
      });

    return this.hydrationInFlight;
  }

  public persistPatch(patch: Partial<UserPreferences>): Promise<void> {
    const sanitizedPatch = sanitizeUserPreferences(patch);
    const layoutPatch = sanitizeKeyedPreferencePatch(
      patch,
      "setLayouts",
      sanitizedPatch.setLayouts
    );
    const filterPatch = sanitizeKeyedPreferencePatch(
      patch,
      "setFilters",
      sanitizedPatch.setFilters
    );
    const transportPatch: UserPreferences = {
      ...sanitizedPatch,
      setLayouts: layoutPatch.values,
      setFilters: filterPatch.values
    };

    this.cache = {
      ...this.cache,
      ...sanitizedPatch,
      sets: sanitizedPatch.sets ?? this.cache.sets,
      setLayouts: mergeKeyedScope(
        this.cache.setLayouts,
        sanitizedPatch.setLayouts,
        layoutPatch.touchedIds
      ),
      setFilters: mergeKeyedScope(
        this.cache.setFilters,
        sanitizedPatch.setFilters,
        filterPatch.touchedIds
      )
    };
    this.desiredPatch = mergeTransportPatches(this.desiredPatch, transportPatch);
    const requestRevision = ++this.desiredRevision;

    const queuedWrite = this.writeQueue
      .catch(() => {
        // A failed request must never block a later preference write.
      })
      .then(async () => {
        const outgoingPatch = mergeTransportPatches(this.recoveryPatch, transportPatch);
        try {
          await this.postToServer(outgoingPatch, requestRevision);
          this.recoveryPatch = null;
        } catch (error: unknown) {
          // Preserve keyed-scope tombstones as well as ordinary values. The
          // next queued write reconciles this patch before it can report success.
          this.recoveryPatch = outgoingPatch;
          throw error;
        }
      });
    this.writeQueue = queuedWrite;
    this.observeSaveStatus(queuedWrite);
    return queuedWrite;
  }

  public subscribeSaveStatus(listener: UserPreferencesSaveStatusListener): () => void {
    this.saveStatusListeners.add(listener);
    return () => this.saveStatusListeners.delete(listener);
  }

  /** Test-only: discards the in-memory cache so suites start from a clean slate. */
  public resetCacheForTests(): void {
    this.cache = {};
    this.hydrated = false;
    this.hydrationInFlight = null;
    this.writeQueue = Promise.resolve();
    this.recoveryPatch = null;
    this.desiredPatch = null;
    this.desiredRevision = 0;
  }

  private async loadFromServer(): Promise<UserPreferences> {
    if (typeof fetch === "undefined") {
      return this.cache;
    }
    try {
      const payload = await this.runWithTimeout(async (signal) => {
        const response = await fetch(USER_PREFERENCES_ENDPOINT, {
          method: "GET",
          headers: { accept: "application/json" },
          signal
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json() as { preferences?: unknown };
      });
      return sanitizeUserPreferences(payload.preferences);
    } catch (error: unknown) {
      throw toClientError("load", error);
    }
  }

  private async postToServer(patch: UserPreferences, requestRevision: number): Promise<void> {
    if (typeof fetch === "undefined") {
      return;
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json"
    };
    const csrfToken = readCsrfTokenFromMeta();
    if (csrfToken) {
      headers[ADO_CSRF_HEADER] = csrfToken;
    }
    try {
      const response = await this.runWithTimeout(
        (signal) => fetch(USER_PREFERENCES_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ preferences: patch }),
          signal
        }),
        (settlement) => this.handleLateWriteSettlement(requestRevision, patch, settlement)
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      throw toClientError("save", error);
    }
  }

  private async runWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    onLateSettlement?: (settlement: LateOperationSettlement<T>) => void
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const request = Promise.resolve().then(() => operation(controller.signal));
    const observedRequest = request.then(
      (value) => {
        if (timedOut) {
          onLateSettlement?.({ value });
        }
        return value;
      },
      (error: unknown) => {
        if (timedOut) {
          onLateSettlement?.({ error });
        }
        throw error;
      }
    );
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(`Request timed out after ${this.requestTimeoutMs}ms.`));
      }, this.requestTimeoutMs);
    });

    try {
      return await Promise.race([observedRequest, timeout]);
    } finally {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  }

  private handleLateWriteSettlement(
    requestRevision: number,
    requestPatch: UserPreferences,
    settlement: LateOperationSettlement<Response>
  ): void {
    if (!("value" in settlement) || !settlement.value.ok) {
      return;
    }

    if (requestRevision === this.desiredRevision) {
      // The timed-out request nevertheless applied the complete latest
      // outgoing footprint. Remove only those fields from recovery because
      // another timed-out request may still own unrelated unsaved fields.
      this.recoveryPatch = removeTransportFootprint(
        this.recoveryPatch,
        requestPatch
      );
      if (this.recoveryPatch === null) {
        this.publishSaveStatus(null);
      }
      return;
    }

    this.enqueueReconciliation(requestPatch);
  }

  private enqueueReconciliation(affectedPatch: UserPreferences): void {
    const reconciliation = this.writeQueue
      .catch(() => {
        // Reconciliation still runs after a failed caller-owned write.
      })
      .then(async () => {
        const requestRevision = this.desiredRevision;
        // A late request can only make fields from its own transport patch
        // stale. Project the latest adapter-owned values onto that footprint
        // so unrelated, already-acknowledged history is never replayed over
        // newer changes from another tab or adapter.
        const desiredState = selectTransportPatch(
          this.desiredPatch ?? {},
          affectedPatch
        );
        try {
          await this.postToServer(desiredState, requestRevision);
          this.recoveryPatch = removeTransportFootprint(
            this.recoveryPatch,
            desiredState
          );
        } catch (error: unknown) {
          this.recoveryPatch = mergeTransportPatches(
            this.recoveryPatch,
            desiredState
          );
          throw error;
        }
      });
    this.writeQueue = reconciliation;
    this.observeSaveStatus(reconciliation);
  }

  private observeSaveStatus(persistence: Promise<void>): void {
    void persistence.then(
      () => {
        if (this.recoveryPatch === null) {
          this.publishSaveStatus(null);
        }
      },
      (error: unknown) => this.publishSaveStatus(toClientError("save", error))
    );
  }

  private publishSaveStatus(error: UserPreferencesClientError | null): void {
    this.saveStatusListeners.forEach((listener) => listener(error));
  }
}

type LateOperationSettlement<T> =
  | { value: T }
  | { error: unknown };

function normalizeTimeout(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function toClientError(
  operation: UserPreferencesClientOperation,
  error: unknown
): UserPreferencesClientError {
  if (error instanceof UserPreferencesClientError) {
    return error;
  }

  const message = operation === "load"
    ? "Settings could not be loaded. Local browser settings are being used."
    : "Settings could not be saved permanently. Your changes remain available in this browser.";
  return new UserPreferencesClientError(operation, message, { cause: error });
}

function mergeTransportPatches(
  recovery: UserPreferences | null,
  incoming: UserPreferences
): UserPreferences {
  if (recovery === null) {
    return incoming;
  }
  return {
    ...recovery,
    ...incoming,
    sets: incoming.sets ?? recovery.sets,
    setLayouts: mergeTransportScope(recovery.setLayouts, incoming.setLayouts),
    setFilters: mergeTransportScope(recovery.setFilters, incoming.setFilters)
  };
}

function mergeTransportScope<T>(
  recovery: Record<string, T> | undefined,
  incoming: Record<string, T> | undefined
): Record<string, T> | undefined {
  if (incoming === undefined) {
    return recovery;
  }
  return { ...(recovery ?? {}), ...incoming };
}

function selectTransportPatch(
  desired: UserPreferences,
  affected: UserPreferences
): UserPreferences {
  const selected: UserPreferences = {};
  copyAffectedValue(selected, desired, affected, "themeMode");
  copyAffectedValue(selected, desired, affected, "sets");
  copyAffectedValue(selected, desired, affected, "activeSetId");
  copyAffectedValue(selected, desired, affected, "adoContext");
  copyAffectedValue(selected, desired, affected, "updatedAt");
  selected.setLayouts = selectTransportScope(desired.setLayouts, affected.setLayouts);
  selected.setFilters = selectTransportScope(desired.setFilters, affected.setFilters);
  return selected;
}

function copyAffectedValue<K extends keyof UserPreferences>(
  target: UserPreferences,
  desired: UserPreferences,
  affected: UserPreferences,
  key: K
): void {
  if (!Object.prototype.hasOwnProperty.call(affected, key)) {
    return;
  }
  const value = desired[key];
  if (value !== undefined) {
    Object.assign(target, { [key]: value });
  }
}

function selectTransportScope<T>(
  desired: Record<string, T> | undefined,
  affected: Record<string, T> | undefined
): Record<string, T> | undefined {
  if (affected === undefined || desired === undefined) {
    return undefined;
  }
  const selected: Record<string, T> = {};
  Object.keys(affected).forEach((scopeId) => {
    if (Object.prototype.hasOwnProperty.call(desired, scopeId)) {
      selected[scopeId] = desired[scopeId];
    }
  });
  return Object.keys(selected).length > 0 ? selected : undefined;
}

function removeTransportFootprint(
  recovery: UserPreferences | null,
  applied: UserPreferences
): UserPreferences | null {
  if (recovery === null) {
    return null;
  }

  const remaining: UserPreferences = {
    ...recovery,
    setLayouts: recovery.setLayouts ? { ...recovery.setLayouts } : undefined,
    setFilters: recovery.setFilters ? { ...recovery.setFilters } : undefined
  };
  removeAffectedValue(remaining, applied, "themeMode");
  removeAffectedValue(remaining, applied, "sets");
  removeAffectedValue(remaining, applied, "activeSetId");
  removeAffectedValue(remaining, applied, "adoContext");
  removeAffectedValue(remaining, applied, "updatedAt");
  remaining.setLayouts = removeTransportScope(
    remaining.setLayouts,
    applied.setLayouts
  );
  remaining.setFilters = removeTransportScope(
    remaining.setFilters,
    applied.setFilters
  );
  return hasTransportValues(remaining) ? remaining : null;
}

function removeAffectedValue<K extends keyof UserPreferences>(
  remaining: UserPreferences,
  applied: UserPreferences,
  key: K
): void {
  if (Object.prototype.hasOwnProperty.call(applied, key) && applied[key] !== undefined) {
    delete remaining[key];
  }
}

function removeTransportScope<T>(
  recovery: Record<string, T> | undefined,
  applied: Record<string, T> | undefined
): Record<string, T> | undefined {
  if (recovery === undefined || applied === undefined) {
    return recovery;
  }
  Object.keys(applied).forEach((scopeId) => {
    delete recovery[scopeId];
  });
  return Object.keys(recovery).length > 0 ? recovery : undefined;
}

function hasTransportValues(patch: UserPreferences): boolean {
  return patch.themeMode !== undefined ||
    patch.sets !== undefined ||
    patch.activeSetId !== undefined ||
    patch.adoContext !== undefined ||
    patch.setLayouts !== undefined ||
    patch.setFilters !== undefined ||
    patch.updatedAt !== undefined;
}

function mergeKeyedScope<T>(
  current: Record<string, T> | undefined,
  incoming: Record<string, T> | undefined,
  touched: Set<string> | null
): Record<string, T> | undefined {
  if (touched === null) {
    return current;
  }
  const next: Record<string, T> = { ...(current ?? {}) };
  for (const setId of touched) {
    const value = incoming?.[setId];
    if (value === undefined) {
      delete next[setId];
    } else {
      next[setId] = value;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
