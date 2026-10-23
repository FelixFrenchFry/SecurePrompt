import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { launchExtension } from '../fixtures/extension';
import { MODEL_FILE } from '../support/paths';

test.skip(!existsSync(MODEL_FILE), 'needs the model files in .models/');

// values the rules and the model must find, and that must never leave the masked output's way
const CANARY = {
    name: 'Quentin Vasquez-Lindqvist',
    email: 'canary.7f3a9c@example.test',
    phone: '+49 151 70384219',
    iban: 'DE89 3704 0044 0532 0130 00',
};

test('masks a prompt in the side panel without leaking it to the network, storage or console', async ({}, testInfo) =>
{
    const netLog = testInfo.outputPath('net-log.json');
    const { context, worker } = await launchExtension(netLog);
    const consoleMessages: string[] = [];
    let output = '';
    let stored = '';

    context.on('console', (message) => consoleMessages.push(message.text()));
    worker.on('console', (message) => consoleMessages.push(message.text()));

    try
    {
        const page = await context.newPage();

        page.on('console', (message) => consoleMessages.push(message.text()));
        await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
        await page.locator('textarea').first().fill(
            `Bitte leite das an ${CANARY.name} weiter, erreichbar unter ${CANARY.email} oder ${CANARY.phone}. Überweisung auf ${CANARY.iban}.`,
        );
        await page.getByRole('button', { name: 'Privatize', exact: true }).click();

        // the preview shows the masked prompt once the model has run
        const preview = page.locator('.preview-mask').first().locator('..');

        await expect(preview).toContainText('PERSON_001', { timeout: 300_000 });
        output = await preview.innerText();

        // persistent storage must hold no prompt text, chrome.storage.session may hold mappings
        stored = JSON.stringify(
            await worker.evaluate(async () =>
            {
                type Area = { get: (keys: null) => Promise<Record<string, unknown>> };
                const { storage } = (globalThis as unknown as { chrome: { storage: { local: Area; sync: Area } } }).chrome;

                return { local: await storage.local.get(null), sync: await storage.sync.get(null) };
            }),
        );
    }
    finally
    {
        await context.close();
    }

    const traffic = readFileSync(netLog, 'utf8') + readFileSync(process.env.SECUREPROMPT_MIRROR_LOG!, 'utf8');

    expect(output).toMatch(/PERSON_001.*EMAIL_001.*PHONE_001.*ACCOUNT_001/s);

    for (const value of Object.values(CANARY))
    {
        expect(output, 'masked output').not.toContain(value);
        expect(traffic, 'network').not.toContain(value);
        expect(traffic, 'network').not.toContain(encodeURIComponent(value));
        expect(stored, 'persistent storage').not.toContain(value);
        expect(consoleMessages.join('\n'), 'console').not.toContain(value);
    }
});
