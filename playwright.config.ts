import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.test-browsers');

export default defineConfig({
    testDir: './tests/browser',
    // builds the test extension and serves the model files locally
    globalSetup: './tests/browser/global-setup.ts',
    projects: [{ name: 'e2e', testMatch: 'e2e/**/*.spec.ts' }],
    forbidOnly: !!process.env.CI,
    workers: 1,
    // loading the model and the larger test files take minutes
    timeout: 900_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: { trace: 'retain-on-failure' },
});
