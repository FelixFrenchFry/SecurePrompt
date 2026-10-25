import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { launchExtension } from '../fixtures/extension';
import { MODEL_FILE } from '../support/paths';

// the test build only exists when the model files do, see global-setup.ts
test.skip(!existsSync(MODEL_FILE), 'needs the model files in .models/');

type Chrome = { chrome: { runtime: { reload: () => void } } };

test('removes a stale launcher after the extension was reloaded, without an error', async () =>
{
    const { context, worker } = await launchExtension();

    try
    {
        // a stand-in chat page under the chat site's address, so the content script runs on it
        await context.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="height:100vh"></body></html>' }));

        const tab = await context.newPage();
        const errors: string[] = [];
        const launcher = tab.locator('#secureprompt-open-sidepanel');

        tab.on('console', (message) =>
        {
            if (message.type() === 'error')
            {
                errors.push(message.text());
            }
        });
        await tab.goto('https://chatgpt.com/');
        await launcher.waitFor();

        // the page keeps the old content script while the extension restarts underneath it
        await worker.evaluate(() => (globalThis as unknown as Chrome).chrome.runtime.reload());
        await tab.waitForTimeout(1500);
        await tab.mouse.click(tab.viewportSize()!.width - 46, tab.viewportSize()!.height - 46);

        await expect(launcher).toHaveCount(0);
        expect(errors).toEqual([]);
    }
    finally
    {
        await context.close();
    }
});
