import { createUserPreferenceStore } from '../../shared/user-preferences/create-user-preference-store.js';
import { sanitizeMatrixConfig, type MatrixConfig } from '../../domain/release-matrix/matrix-config.js';
export const matrixPreferenceStore = createUserPreferenceStore<MatrixConfig>({
    storageKey: 'azure-testops.release-matrix.v1',
    readFromServerCache: (preferences, key) => key ? preferences.setReleaseMatrices?.[key] : null,
    sanitize: sanitizeMatrixConfig,
    buildPatch: (value, _preferences, key) => key ? { setReleaseMatrices: { [key]: value } } : {}
});
