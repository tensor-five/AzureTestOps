import * as React from "react";

import type { PreflightStatus } from "./header.js";

/**
 * Runs `/phase2/auth-preflight` once on mount and exposes the current status.
 *
 * Auth preflight stays a top-level concern (rather than a per-feature hook)
 * because every screen needs to render the badge — so we intentionally avoid
 * coupling it to set-management or any other feature module.
 */
export function useAuthPreflight(): PreflightStatus {
  const [status, setStatus] = React.useState<PreflightStatus>("CHECKING");

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/phase2/auth-preflight", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) {
          return { result: { status: "UNKNOWN_ERROR" as PreflightStatus } };
        }
        return (await response.json()) as { result: { status: PreflightStatus } };
      })
      .then((payload) => {
        if (cancelled) return;
        setStatus(payload.result?.status ?? "UNKNOWN_ERROR");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("UNKNOWN_ERROR");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
