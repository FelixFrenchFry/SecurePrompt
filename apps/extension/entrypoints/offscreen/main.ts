import { PipelineCancelledError } from '@secureprompt/core';
import { createBardsaiDetector } from '@secureprompt/model-runtime';
import ortMjsUrl from 'model-onnx-runtime/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from 'model-onnx-runtime/ort-wasm-simd-threaded.asyncify.wasm?url';
import { browser, type Browser } from 'wxt/browser';
import { MODEL_PORT, type ModelEvent, type ModelRequest } from '../../source/model/protocol';

// the model host: runs bardsai in this hidden page for all extension pages, text stays in memory

const ports = new Set<Browser.runtime.Port>();

// the ONNX runtime files packaged by the build, as full extension URLs
const runtimeFile = (path: string) => new URL(path, location.href).href;

const broadcast = (event: ModelEvent) =>
{
    for (const port of ports)
    {
        port.postMessage(event);
    }
};

const detector = createBardsaiDetector({
    device: 'wasm',
    allowRemoteModels: true,
    // test builds download from a local mirror instead of Hugging Face
    ...(import.meta.env.WXT_MODEL_HOST == null ? {} : { remoteHost: import.meta.env.WXT_MODEL_HOST }),
    // three quarters of the cores, at most 16, so the browser stays responsive
    threads: Math.max(1, Math.min(16, Math.floor(navigator.hardwareConcurrency * 0.75))),
    runtimeFiles: {
        mjs: runtimeFile(ortMjsUrl),
        wasm: runtimeFile(ortWasmUrl),
    },
    onProgress: ({ status, file, progress, loaded, total }) =>
    {
        broadcast({
            type: 'loading',
            status,
            ...(file == null ? {} : { file }),
            ...(progress == null ? {} : { progress }),
            ...(loaded == null ? {} : { loaded }),
            ...(total == null ? {} : { total }),
        });
    },
});

// one request at a time, the model uses all its threads for each
let queue: Promise<void> = Promise.resolve();

browser.runtime.onConnect.addListener((port) =>
{
    // only the extension's own pages, never content scripts on chat sites
    if (port.name !== MODEL_PORT || port.sender?.url?.startsWith(browser.runtime.getURL('/')) !== true)
    {
        port.disconnect();
        return;
    }

    const running = new Map<number, AbortController>();

    ports.add(port);
    port.postMessage({ type: 'ready', crossOriginIsolated, cores: navigator.hardwareConcurrency } satisfies ModelEvent);

    port.onDisconnect.addListener(() =>
    {
        ports.delete(port);

        // the requesting page is gone, so its work is dropped
        for (const controller of running.values())
        {
            controller.abort();
        }
    });

    port.onMessage.addListener((message: ModelRequest) =>
    {
        if (message.type === 'cancel')
        {
            running.get(message.id)?.abort();
            return;
        }

        const { id, text } = message;
        const controller = new AbortController();
        const send = (event: ModelEvent) =>
        {
            if (ports.has(port))
            {
                port.postMessage(event);
            }
        };

        running.set(id, controller);
        queue = queue.then(async () =>
        {
            try
            {
                const detections = await detector.detect(text, {
                    signal: controller.signal,
                    onProgress: (fraction) => send({ type: 'progress', id, fraction }),
                });

                send({ type: 'result', id, detections });
            }
            catch (error)
            {
                // the error itself is never sent or logged, it may quote text
                send({ type: 'failed', id, reason: error instanceof PipelineCancelledError ? 'cancelled' : 'error' });
            }
            finally
            {
                running.delete(id);
            }
        });
    });
});
