import { PipelineCancelledError, type DetectContext, type Detection, type Detector } from '@secureprompt/core';
import { browser, type Browser } from 'wxt/browser';
import { MODEL_PORT, type ModelEvent, type ModelRequest } from './protocol';

export type ModelHostInfo = Extract<ModelEvent, { type: 'ready' }>;
export type ModelLoading = Extract<ModelEvent, { type: 'loading' }>;

export type OffscreenDetectorOptions = {
    // creates the model host if needed, and rejects without the model download permission
    ensureHost: () => Promise<void>;
    onReady?: (info: ModelHostInfo) => void;
    onLoading?: (loading: ModelLoading) => void;
};

type Pending = {
    resolve: (detections: Detection[]) => void;
    reject: (error: Error) => void;
    onProgress?: (fraction: number) => void;
};

// the model as a pipeline detector, running in the offscreen model host
export const createOffscreenDetector = (options: OffscreenDetectorOptions): Detector =>
{
    // one connection attempt shared by all callers, so concurrent requests use one port
    let connecting: Promise<Browser.runtime.Port> | undefined;
    let nextId = 1;
    const pending = new Map<number, Pending>();

    const handle = (event: ModelEvent) =>
    {
        if (event.type === 'ready')
        {
            options.onReady?.(event);
            return;
        }

        if (event.type === 'loading')
        {
            options.onLoading?.(event);
            return;
        }

        const request = pending.get(event.id);

        if (request == null)
        {
            return;
        }

        if (event.type === 'progress')
        {
            request.onProgress?.(event.fraction);
            return;
        }

        pending.delete(event.id);

        if (event.type === 'result')
        {
            request.resolve(event.detections);
        }
        else
        {
            request.reject(event.reason === 'cancelled' ? new PipelineCancelledError() : new Error('The model failed'));
        }
    };

    const connect = () =>
    {
        if (connecting != null)
        {
            return connecting;
        }

        const attempt = (async () =>
        {
            await options.ensureHost();

            const connected = browser.runtime.connect({ name: MODEL_PORT });

            connected.onMessage.addListener(handle);
            connected.onDisconnect.addListener(() =>
            {
                if (connecting === attempt)
                {
                    connecting = undefined;
                }

                for (const request of pending.values())
                {
                    request.reject(new Error('The model host closed'));
                }

                pending.clear();
            });

            return connected;
        })();

        // a failed start, such as a missing permission, may be retried later
        attempt.catch(() =>
        {
            if (connecting === attempt)
            {
                connecting = undefined;
            }
        });
        connecting = attempt;

        return attempt;
    };

    const detect = async (text: string, context: DetectContext = {}): Promise<Detection[]> =>
    {
        const { signal, onProgress } = context;
        const checkCancelled = () =>
        {
            if (signal?.aborted === true)
            {
                throw new PipelineCancelledError();
            }
        };

        checkCancelled();

        const connected = await connect();

        // an abort while connecting fired before the listener below exists
        checkCancelled();

        const id = nextId;

        nextId += 1;

        return new Promise<Detection[]>((resolve, reject) =>
        {
            pending.set(id, { resolve, reject, ...(onProgress == null ? {} : { onProgress }) });
            signal?.addEventListener?.(
                'abort',
                () =>
                {
                    // finished requests and closed hosts need no cancel
                    if (pending.has(id))
                    {
                        connected.postMessage({ type: 'cancel', id } satisfies ModelRequest);
                    }
                },
                { once: true },
            );
            connected.postMessage({ type: 'detect', id, text } satisfies ModelRequest);
        });
    };

    return { id: 'model:bardsai-v2', detect };
};
