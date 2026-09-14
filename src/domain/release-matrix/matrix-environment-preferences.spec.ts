import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { LowdbUserPreferencesAdapter } from '../../adapters/persistence/settings/lowdb-user-preferences.adapter.js';
import { emptyMatrixConfig, sanitizeMatrixConfig } from './matrix-config.js';

describe('Matrix environment preferences', () => {
    it('defaults existing v3 and migrated preferences to separate environments', () => {
        for (const version of [1, 2, 3]) {
            const clean = sanitizeMatrixConfig({ version, planId: 1, catalogRootId: 10 });
            expect(clean?.separateEnvironments).toBe(true);
            expect(clean?.combinedMappings).toEqual({});
        }
    });
    it('only persists explicit booleans and valid physical suite IDs without prototype pollution', () => {
        const base = emptyMatrixConfig(1, 10);
        const clean = sanitizeMatrixConfig({ ...base, separateEnvironments: false,
            combinedMappings: { '["Regression",100,"release"]': 25, ...JSON.parse('{"__proto__":32,"bad":-1,"string":"25","fraction":1.2}') } });
        expect(clean?.separateEnvironments).toBe(false);
        expect(clean?.combinedMappings?.['["Regression",100,"release"]']).toBe(25);
        expect(Object.keys(clean!.combinedMappings!)).toEqual(['["Regression",100,"release"]', '__proto__']);
        expect(Object.getPrototypeOf(clean!.combinedMappings!)).toBe(Object.prototype);
        expect(sanitizeMatrixConfig({ ...base, separateEnvironments: 'false', combinedMappings: [] })?.separateEnvironments).toBe(true);
    });
    it('retains checkbox, per-cell choices and both grouping modes after a lowdb restart', async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'matrix-environments-'));
        // lowdb's preset otherwise intentionally substitutes an in-memory adapter during tests.
        vi.stubEnv('NODE_ENV', 'development');
        try {
            const file = path.join(directory, 'preferences.json');
            const config = { ...emptyMatrixConfig(1, 10), separateEnvironments: false,
                combinedMappings: { '["Regression",100,"release"]': 25 }, mappings: { '["TST","Regression","release"]': 32 },
                groupOrderByMode: { environment: ['TST', 'ACC'], content: ['Regression'] }, collapsedByMode: { environment: ['ACC'], content: [] } };
            await new LowdbUserPreferencesAdapter(file, 'reader').mergePreferences({ setReleaseMatrices: { release: config } });
            const restored = (await new LowdbUserPreferencesAdapter(file, 'reader').getPreferences()).setReleaseMatrices?.release;
            expect(restored).toEqual(config);
            expect(sanitizeMatrixConfig({ ...restored, separateEnvironments: true })?.combinedMappings).toEqual(config.combinedMappings);
        } finally {
            vi.unstubAllEnvs();
            await rm(directory, { recursive: true, force: true });
        }
    });
});
