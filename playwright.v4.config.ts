import { defineConfig } from '@playwright/test';
import previous from './playwright.config.js';

// Historical frozen contracts remain on disk; v4 replaces their active matrix scenarios.
export default defineConfig({
    ...previous,
    testIgnore: [
        ...(Array.isArray(previous.testIgnore) ? previous.testIgnore : previous.testIgnore ? [previous.testIgnore] : []),
        '**/release-matrix-v3.hierarchy.spec.ts',
        '**/release-matrix-v3.behavior.spec.ts',
        '**/release-matrix-scrolling.spec.ts'
    ]
});
