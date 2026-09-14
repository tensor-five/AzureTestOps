import * as React from 'react';
import type { ReleaseMatrixClientPort } from '../../application/ports/client/release-matrix-client.port.js';
import type { TestCaseOutcomeUpdate } from '../../domain/test-management/test-case-outcome-update.js';
import { getMatrixMutationStore } from '../../features/release-matrix/matrix-mutation-store.js';

/** The hidden matching view receives only new confirmations for its current Azure scope. */
export function useMatrixOutcomeSync(port: ReleaseMatrixClientPort | undefined, setId: string | null,
  planId: number, contextIdentity: string | undefined, apply: (projection: TestCaseOutcomeUpdate) => void) {
  React.useEffect(() => {
    if (!port || !setId || !contextIdentity || !Number.isSafeInteger(planId)) return;
    return getMatrixMutationStore(port, setId, planId, contextIdentity).subscribeConfirmed(apply);
  }, [port, setId, planId, contextIdentity, apply]);
}
