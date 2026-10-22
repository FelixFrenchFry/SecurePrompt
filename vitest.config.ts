import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
            { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'] } },
        ],
        // coverage measures the shared packages, the extension is measured by browser tests later
        coverage: {
            provider: 'v8',
            include: ['packages/*/src/**/*.ts'],
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            reportsDirectory: 'coverage',
            // fail if coverage drops
            thresholds: {
                'packages/core/**': { statements: 98, branches: 95, functions: 100, lines: 98 },
                // model loading and the detector need the real model files, which CI doesn't have
                'packages/model-runtime/**': { statements: 90, branches: 84, functions: 80, lines: 90 },
            },
        },
    },
});
