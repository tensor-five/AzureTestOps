import * as React from "react";

import { useClientPorts } from "../../app/composition/client-ports-context.js";
import type { PreflightStatus } from "./header.js";

/**
 * Runs the auth preflight once on mount and exposes the current status.
 *
 * Auth preflight stays a top-level concern (rather than a per-feature hook)
 * because every screen needs to render the badge — so we intentionally avoid
 * coupling it to set-management or any other feature module.
 *
 * The transport lives behind {@link AuthPreflightClientPort}; this hook only
 * orchestrates state + cancellation.
 */
export function useAuthPreflight(): PreflightStatus {
  const { authPreflight } = useClientPorts();
  const [status, setStatus] = React.useState<PreflightStatus>("CHECKING");

  React.useEffect(() => {
    let cancelled = false;
    void authPreflight
      .check()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("UNKNOWN_ERROR");
      });
    return () => {
      cancelled = true;
    };
  }, [authPreflight]);

  return status;
}
