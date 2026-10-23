import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import { TEST_EXTENSION_DIR } from '../support/paths';

export type LaunchedExtension = { context: BrowserContext; worker: Worker };

// the test build in a temporary profile with every host but the local mirror unreachable, and
// a Chrome net log of all request addresses and headers when netLog is given
export const launchExtension = async (netLog?: string): Promise<LaunchedExtension> =>
{
    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: true,
        args: [
            `--disable-extensions-except=${TEST_EXTENSION_DIR}`,
            `--load-extension=${TEST_EXTENSION_DIR}`,
            `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`,
            ...(netLog == null ? [] : [`--log-net-log=${netLog}`, '--net-log-capture-mode=IncludeSensitive']),
        ],
    });

    try
    {
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));

        return { context, worker };
    }
    catch (error)
    {
        await context.close();
        throw error;
    }
};
