import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
            { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'] } },
            // the built extension, made by pnpm build
            { test: { name: 'package', include: ['tests/package/**/*.test.ts'] } },
        ],
        coverage: {
            provider: 'v8',
            // the packages, and the side panel's logic, which runs without a browser
            include: [
                'packages/*/src/**/*.ts',
                'apps/extension/source/masking/*.ts',
                'apps/extension/source/ui/state.ts',
                'apps/extension/source/ui/categories.ts',
                'apps/extension/source/settings/types.ts',
                'apps/extension/source/model/download-progress.ts',
                'apps/extension/source/sites/composer-text.ts',
            ],
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            reportsDirectory: 'coverage',
            // fail if coverage drops
            thresholds: {
                'packages/core/**': { statements: 98, branches: 95, functions: 100, lines: 98 },
                // model loading and the detector need the real model files, which CI doesn't have
                'packages/model-runtime/**': { statements: 90, branches: 84, functions: 80, lines: 90 },
                'apps/extension/source/**': { statements: 95, branches: 90, functions: 100, lines: 95 },
            },
        },
    },
});
