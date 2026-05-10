import ortWasmMjsUrl from 'secureprompt-onnx-runtime/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from 'secureprompt-onnx-runtime/ort-wasm-simd-threaded.asyncify.wasm?url';
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
    session_options: {
        executionProviders: Array<{
            name: typeof PRIVACY_FILTER_DEVICE;
            forceCpuNodeNames: readonly string[];
        }>;
    };
};

let privacyFilterPipelinePromise: Promise<PrivacyFilterPipeline> | null = null;

export const getPrivacyFilterPipeline = async (): Promise<PrivacyFilterPipeline> =>
{
    if (privacyFilterPipelinePromise == null)
    {
        privacyFilterPipelinePromise = loadPrivacyFilterPipeline().catch((error) =>
        {
            privacyFilterPipelinePromise = null;
            throw error;
        });
    }

    return privacyFilterPipelinePromise;
};

const loadPrivacyFilterPipeline = async (): Promise<PrivacyFilterPipeline> =>
{
    // dynamically import Transformers.js so the rules-only path does not load model code
    const { env, pipeline } = await import('@huggingface/transformers');

    const pipelineOptions = await configurePrivacyFilterRuntime(env);

    // model files may be downloaded, but prompt text must only be processed locally
    const classifier = await pipeline(
        PRIVACY_FILTER_TASK,
        PRIVACY_FILTER_MODEL_ID,
        pipelineOptions,
    );

    return classifier as PrivacyFilterPipeline;
};

const configurePrivacyFilterRuntime = async (
    env: TransformersEnvironment,
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
