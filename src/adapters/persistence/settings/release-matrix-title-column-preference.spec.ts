import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { emptyMatrixConfig } from '../../../domain/release-matrix/matrix-config.js';
import { LowdbUserPreferencesAdapter } from './lowdb-user-preferences.adapter.js';

describe('Release matrix title-column preference persistence', () => {
  it('keeps each set width in lowdb across a restart', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'matrix-title-width-'));
    const file = path.join(directory, 'preferences.json');
    try {
      const first = { ...emptyMatrixConfig(1, 10), testCaseColumnWidth: 520 };
      const second = { ...emptyMatrixConfig(2, 20), testCaseColumnWidth: 680 };
      const adapter = new LowdbUserPreferencesAdapter(file, 'user');
      await adapter.mergePreferences({ setReleaseMatrices: { first, second } });
      await adapter.mergePreferences({ setReleaseMatrices: { first: { ...first, testCaseColumnWidth: 740 } } });

      const restored = await new LowdbUserPreferencesAdapter(file, 'user').getPreferences();
      expect(restored.setReleaseMatrices?.first.testCaseColumnWidth).toBe(740);
      expect(restored.setReleaseMatrices?.second.testCaseColumnWidth).toBe(680);
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
