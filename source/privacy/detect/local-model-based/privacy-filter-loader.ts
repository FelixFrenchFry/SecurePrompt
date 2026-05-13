import ortWasmMjsUrl from 'secureprompt-onnx-runtime/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from 'secureprompt-onnx-runtime/ort-wasm-simd-threaded.asyncify.wasm?url';
import type { LocalModelProgressCallback } from '../../types';
import {
    PRIVACY_FILTER_DEVICE,
    PRIVACY_FILTER_DTYPE,
    PRIVACY_FILTER_AGGREGATION_STRATEGY,
    PRIVACY_FILTER_MODEL_ID,
    PRIVACY_FILTER_TASK,
    PRIVACY_FILTER_WEBGPU_FORCE_CPU_NODE_NAMES,
} from './privacy-filter-config';

export type PrivacyFilterOutput = {
    entity_group?: string;
    entity?: string;
    score?: number;
    word?: string;
    start?: number;
    end?: number;
};

export type PrivacyFilterPipelineOptions = {
    aggregation_strategy: typeof PRIVACY_FILTER_AGGREGATION_STRATEGY;
};

export type PrivacyFilterPipeline = (
    inputText: string,
    options: PrivacyFilterPipelineOptions,
) => Promise<PrivacyFilterOutput[]>;

type TransformersEnvironment = {
    backends: {
        onnx: {
            wasm?: {
                wasmPaths?:
                    | string
                    | {
                          mjs?: string | URL;
                          wasm?: string | URL;
                      };
            };
            webgpu?: {
                adapter?: unknown;
                powerPreference?: 'low-power' | 'high-performance';
            };
        };
    };
    useWasmCache: boolean;
};

type ExtensionRuntimeGlobal = typeof globalThis & {
    chrome?: {
        runtime?: {
            getURL?: (path: string) => string;
        };
    };
};

type WebGpuRuntimeGlobal = typeof globalThis & {
    navigator?: {
        gpu?: {
            requestAdapter?: () => Promise<unknown | null>;
        };
    };
};

type PrivacyFilterPipelineLoadOptions = {
    device: typeof PRIVACY_FILTER_DEVICE;
    dtype: typeof PRIVACY_FILTER_DTYPE;
    progress_callback: (progress: TransformersProgress) => void;
    session_options: {
        executionProviders: Array<{
            name: typeof PRIVACY_FILTER_DEVICE;
            forceCpuNodeNames: readonly string[];
        }>;
    };
};

type TransformersProgress = {
    status?: string;
    name?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
};

let privacyFilterPipelinePromise: Promise<PrivacyFilterPipeline> | null = null;
let privacyFilterPipelineLoaded = false;

export const getPrivacyFilterPipeline = async (
    onProgress?: LocalModelProgressCallback,
): Promise<PrivacyFilterPipeline> =>
{
    if (privacyFilterPipelinePromise == null)
    {
        privacyFilterPipelinePromise = loadPrivacyFilterPipeline(onProgress)
            .then((pipeline) =>
            {
                privacyFilterPipelineLoaded = true;
                return pipeline;
            })
            .catch((error) =>
            {
                privacyFilterPipelinePromise = null;
                privacyFilterPipelineLoaded = false;
                throw error;
            });
    }
    else
    {
        onProgress?.({
            phase: 'load',
            label: privacyFilterPipelineLoaded
                ? 'Using loaded local model.'
                : 'Waiting for local model.',
            progress: privacyFilterPipelineLoaded ? 100 : undefined,
        });
    }

    return privacyFilterPipelinePromise;
};

const loadPrivacyFilterPipeline = async (
    onProgress: LocalModelProgressCallback | undefined,
): Promise<PrivacyFilterPipeline> =>
{
    onProgress?.({
        phase: 'runtime',
        label: 'Preparing local model runtime.',
    });

    // dynamically import Transformers.js so the rules-only path does not load model code
    const { env, pipeline } = await import('@huggingface/transformers');

    const pipelineOptions = await configurePrivacyFilterRuntime(env, onProgress);

    onProgress?.({
        phase: 'load',
        label: 'Loading privacy model.',
    });

    // model files may be downloaded, but prompt text must only be processed locally
    const classifier = await pipeline(
        PRIVACY_FILTER_TASK,
        PRIVACY_FILTER_MODEL_ID,
        pipelineOptions,
    );

    onProgress?.({
        phase: 'load',
        label: 'Local model loaded.',
        progress: 100,
    });

    return classifier as PrivacyFilterPipeline;
};

const configurePrivacyFilterRuntime = async (
    env: TransformersEnvironment,
    onProgress: LocalModelProgressCallback | undefined,
): Promise<PrivacyFilterPipelineLoadOptions> =>
{
    const wasmBackend = env.backends.onnx.wasm;

    if (wasmBackend == null)
    {
        throw new Error('ONNX Runtime WASM backend is not available.');
    }

    // extension-packaged files should be loaded directly, not cached
    env.useWasmCache = false;

    clearIgnoredWebGpuPowerPreference(env);
    await configureWebGpuAdapter(env);

    // use extension-packaged ONNX runtime files instead of the default CDN paths
    wasmBackend.wasmPaths = {
        mjs: createExtensionAssetUrl(ortWasmMjsUrl),
        wasm: createExtensionAssetUrl(ortWasmUrl),
    };

    return {
        device: PRIVACY_FILTER_DEVICE,
        dtype: PRIVACY_FILTER_DTYPE,
        progress_callback: createTransformersProgressCallback(onProgress),
        session_options: {
            executionProviders: [
                {
                    name: PRIVACY_FILTER_DEVICE,
                    forceCpuNodeNames: PRIVACY_FILTER_WEBGPU_FORCE_CPU_NODE_NAMES,
                },
            ],
        },
    };
};

const createTransformersProgressCallback = (
    onProgress: LocalModelProgressCallback | undefined,
) =>
{
    return (progress: TransformersProgress) =>
    {
        if (onProgress == null)
        {
            return;
        }

        const status = progress.status;

        if (status === 'progress' || status === 'progress_total')
        {
            onProgress({
                phase: 'download',
                label: 'Downloading model files.',
                progress: getProgressPercent(progress.progress),
                loadedBytes: getFiniteNumber(progress.loaded),
                totalBytes: getFiniteNumber(progress.total),
                file: progress.file,
            });
            return;
        }

        if (status === 'download' || status === 'initiate')
        {
            onProgress({
                phase: 'download',
                label: 'Preparing model download.',
                file: progress.file,
            });
            return;
        }

        if (status === 'done')
        {
            onProgress({
                phase: 'download',
                label: 'Model file ready.',
                file: progress.file,
            });
            return;
        }

        if (status === 'ready')
        {
            onProgress({
                phase: 'load',
                label: 'Model files ready.',
                progress: 100,
            });
        }
    };
};

const getProgressPercent = (progress: number | undefined) =>
{
    const value = getFiniteNumber(progress);

    if (value == null)
    {
        return undefined;
    }

    return Math.max(0, Math.min(100, value));
};

const getFiniteNumber = (value: number | undefined) =>
{
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const clearIgnoredWebGpuPowerPreference = (env: TransformersEnvironment) =>
{
    delete env.backends.onnx.webgpu?.powerPreference;
};

const configureWebGpuAdapter = async (env: TransformersEnvironment) =>
{
    const webgpuBackend = env.backends.onnx.webgpu;

    if (webgpuBackend == null || webgpuBackend.adapter != null)
    {
        return;
    }

    const gpu = (globalThis as WebGpuRuntimeGlobal).navigator?.gpu;

    if (gpu?.requestAdapter == null)
    {
        return;
    }

    // avoid Chrome's ignored Windows power preference hint
    const adapter = await gpu.requestAdapter();

    if (adapter != null)
    {
        webgpuBackend.adapter = adapter;
    }
};

const createExtensionAssetUrl = (assetUrl: string): string =>
{
    const extensionRuntime = (globalThis as ExtensionRuntimeGlobal).chrome?.runtime;
    const assetPath = assetUrl.replace(/^\//, '');

    if (extensionRuntime?.getURL != null)
    {
        return extensionRuntime.getURL(assetPath);
    }

    if (globalThis.location?.href != null)
    {
        return new URL(assetUrl, globalThis.location.href).href;
    }

    return assetUrl;
};
