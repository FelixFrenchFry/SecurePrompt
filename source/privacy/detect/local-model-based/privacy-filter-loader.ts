import ortWasmMjsUrl from 'secureprompt-onnx-runtime/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from 'secureprompt-onnx-runtime/ort-wasm-simd-threaded.asyncify.wasm?url';
import {
    PRIVACY_FILTER_DEVICE,
    PRIVACY_FILTER_DTYPE,
    PRIVACY_FILTER_AGGREGATION_STRATEGY,
    PRIVACY_FILTER_MODEL_ID,
    PRIVACY_FILTER_TASK,
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
        };
    };
};

type ExtensionRuntimeGlobal = typeof globalThis & {
    chrome?: {
        runtime?: {
            getURL?: (path: string) => string;
        };
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

    configurePrivacyFilterRuntime(env);

    // model files may be downloaded, but prompt text must only be processed locally
    const classifier = await pipeline(
        PRIVACY_FILTER_TASK,
        PRIVACY_FILTER_MODEL_ID,
        {
            device: PRIVACY_FILTER_DEVICE,
            dtype: PRIVACY_FILTER_DTYPE,
        },
    );

    return classifier as PrivacyFilterPipeline;
};

const configurePrivacyFilterRuntime = (env: TransformersEnvironment) =>
{
    const wasmBackend = env.backends.onnx.wasm;

    if (wasmBackend == null)
    {
        throw new Error('ONNX Runtime WASM backend is not available.');
    }

    // use extension-packaged ONNX Runtime files instead of the default CDN paths
    wasmBackend.wasmPaths = {
        mjs: createExtensionAssetUrl(ortWasmMjsUrl),
        wasm: createExtensionAssetUrl(ortWasmUrl),
    };
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
