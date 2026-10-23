import { expect, test, type Worker } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchExtension, type LaunchedExtension } from '../fixtures/extension';
import { MODEL_FILE, TEST_FILES_DIR } from '../support/paths';

type DetectResult = {
    detections: Array<{ start: number; end: number; category: string }>;
    progress: number[];
    milliseconds: number;
    info?: { crossOriginIsolated: boolean; cores: number };
};

// the test hook the test build registers in the service worker
type TestHook = {
    detect: (text: string) => Promise<DetectResult>;
    detectAndCancel: (text: string) => Promise<string>;
    detectConcurrently: (texts: string[]) => Promise<{ detections: number[]; connections: number }>;
    detectCancelledWhileConnecting: (text: string) => Promise<string>;
};

const detect = (worker: Worker, text: string) =>
{
    return worker.evaluate((input) => (globalThis as { securePromptTest?: TestHook }).securePromptTest!.detect(input), text);
};

const testFile = (size: string) => readFileSync(join(TEST_FILES_DIR, size, 'incident-packet.txt'), 'utf8');

test.skip(!existsSync(MODEL_FILE), 'needs the model files in .models/');
test.describe.configure({ mode: 'serial' });

test.describe('bardsai in the offscreen page', () =>
{
    let extension: LaunchedExtension;

    test.beforeAll(async () =>
    {
        extension = await launchExtension();
    });

    test.afterAll(async () =>
    {
        await extension?.context.close();
    });

    test('runs the model with several threads and finds personal data', async () =>
    {
        const text = 'Sehr geehrter Herr Koch, bitte rufen Sie Frau Dr. Sabine Krüger unter 0221 9876543 an.';
        const result = await detect(extension.worker, text);
        const found = result.detections.map((detection) => [text.slice(detection.start, detection.end), detection.category]);

        expect(found).toContainEqual(['Koch', 'PERSON']);
        expect(found).toContainEqual(['Sabine Krüger', 'PERSON']);
        expect(found).toContainEqual(['0221 9876543', 'PHONE']);
        expect(result.info?.crossOriginIsolated).toBe(true);
        expect(result.progress.at(-1)).toBe(1);
    });

    test('stops a running detection when cancelled', async () =>
    {
        const outcome = await extension.worker.evaluate(
            (input) => (globalThis as { securePromptTest?: TestHook }).securePromptTest!.detectAndCancel(input),
            testFile('100kb'),
        );

        expect(outcome).toBe('cancelled');
    });

    test('shares one connection between requests started at the same time', async () =>
    {
        const texts = ['Anruf von Petra Lange', 'Mail an jonas.weber@example.de', 'IBAN DE89370400440532013000'];
        const result = await extension.worker.evaluate((input) =>
        {
            const testHook = (globalThis as { securePromptTest?: TestHook }).securePromptTest!;

            return testHook.detectConcurrently(input);
        }, texts);

        expect(result.connections).toBe(1);
        expect(result.detections.every((count) => count > 0)).toBe(true);
    });

    test('drops a request cancelled while still connecting', async () =>
    {
        const outcome = await extension.worker.evaluate(
            (input) => (globalThis as { securePromptTest?: TestHook }).securePromptTest!.detectCancelledWhileConnecting(input),
            testFile('10kb'),
        );

        expect(outcome).toBe('cancelled');
    });

    // sizes to measure, more with SECUREPROMPT_SPEED_SIZES=1kb,10kb,100kb,1000kb
    test('measures the speed on test files', async ({}, testInfo) =>
    {
        const sizes = (process.env.SECUREPROMPT_SPEED_SIZES ?? '1kb,10kb,100kb').split(',');
        const rows = [];

        for (const size of sizes)
        {
            const text = testFile(size);
            const result = await detect(extension.worker, text);

            rows.push({
                size,
                characters: text.length,
                seconds: Number((result.milliseconds / 1000).toFixed(2)),
                charactersPerSecond: Math.round(text.length / (result.milliseconds / 1000)),
                detections: result.detections.length,
                cores: result.info?.cores,
            });
        }

        const report = JSON.stringify(rows, null, 4);

        console.log(`model speed in the browser:\n${report}`);
        writeFileSync(testInfo.outputPath('model-speed.json'), report);
        await testInfo.attach('model-speed', { body: report, contentType: 'application/json' });
        expect(rows.every((row) => row.detections > 0)).toBe(true);
    });
});

test('sends no prompt text over the network', async ({}, testInfo) =>
{
    const canary = ['Quentin Vasquez-Lindqvist', 'canary.7f3a9c@example.test', '+49 151 70384219'];
    const netLog = testInfo.outputPath('net-log.json');
    const extension = await launchExtension(netLog);

    try
    {
        const result = await detect(extension.worker, `Bitte an ${canary[0]} (${canary[1]}, ${canary[2]}) weiterleiten.`);

        expect(result.detections.length).toBeGreaterThan(0);
    }
    finally
    {
        await extension.context.close();
    }

    // the net log has every address and header the browser sent, the mirror log every body it got,
    // and other hosts can't be reached, so no body leaves the browser elsewhere
    const netLogText = readFileSync(netLog, 'utf8');
    const traffic = netLogText + readFileSync(process.env.SECUREPROMPT_MIRROR_LOG!, 'utf8');

    // both logs saw the model download, so they did record this browser's traffic
    expect(netLogText).toContain('model_quantized.onnx');

    for (const value of [...canary, ...canary.map(encodeURIComponent)])
    {
        expect(traffic).not.toContain(value);
    }
});
