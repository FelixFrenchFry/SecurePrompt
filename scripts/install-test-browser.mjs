import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// installs Playwright's Chromium into .test-browsers, separate from the user's browsers
const result = spawnSync('pnpm exec playwright install chromium', {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve('.test-browsers') },
});

if (result.error)
{
    throw result.error;
}

process.exitCode = result.status ?? 1;
