import { PipelineCancelledError } from '@secureprompt/core';
import { createOffscreenDetector, type ModelHostInfo } from './client';
import { ensureModelHost } from './host';

// browser tests drive the model from the service worker, only in test builds
export const registerModelTestHook = () =>
{
    if (import.meta.env.WXT_MODEL_HOST == null)
    {
        return;
    }

    let info: ModelHostInfo | undefined;
    const detector = createOffscreenDetector({ ensureHost: ensureModelHost, onReady: (ready) => (info = ready) });

    const detect = async (text: string) =>
    {
        const progress: number[] = [];
        const startedAt = performance.now();
        const detections = await detector.detect(text, { onProgress: (fraction) => progress.push(fraction) });

        return { detections, progress, milliseconds: performance.now() - startedAt, info };
    };

    // cancels after the first progress update, as a user pressing cancel mid-run would
    const detectAndCancel = async (text: string) =>
    {
        const controller = new AbortController();

        try
        {
            await detector.detect(text, { signal: controller.signal, onProgress: () => controller.abort() });
            return 'finished';
        }
        catch (error)
        {
            return error instanceof PipelineCancelledError ? 'cancelled' : 'failed';
        }
    };

    // starts all texts at once on a fresh client, which has no connection yet
    const detectConcurrently = async (texts: string[]) =>
    {
        let connections = 0;
        const fresh = createOffscreenDetector({ ensureHost: ensureModelHost, onReady: () => (connections += 1) });
        const results = await Promise.all(texts.map((text) => fresh.detect(text)));

        return { detections: results.map((found) => found.length), connections };
    };

    // aborts while a fresh client is still connecting
    const detectCancelledWhileConnecting = async (text: string) =>
    {
        const fresh = createOffscreenDetector({ ensureHost: ensureModelHost });
        const controller = new AbortController();
        const run = fresh.detect(text, { signal: controller.signal });

        controller.abort();

        try
        {
            await run;
            return 'finished';
        }
        catch (error)
        {
            return error instanceof PipelineCancelledError ? 'cancelled' : 'failed';
        }
    };

    (globalThis as { securePromptTest?: unknown }).securePromptTest = {
        detect,
        detectAndCancel,
        detectConcurrently,
        detectCancelledWhileConnecting,
    };
};
