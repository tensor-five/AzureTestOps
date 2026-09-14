import { defineConfig } from '@playwright/test';
import previous from './playwright.v4.config.js';

// Current layout scenarios replace their frozen v4 predecessors; all other suites stay active.
export default defineConfig({
    ...previous,
    testIgnore: [
        ...(Array.isArray(previous.testIgnore) ? previous.testIgnore : previous.testIgnore ? [previous.testIgnore] : []),
        '**/release-matrix-v4.behavior.spec.ts',
        '**/release-matrix-v4.hierarchy.spec.ts',
        '**/release-matrix-v4.selection.spec.ts'
    ]
});
