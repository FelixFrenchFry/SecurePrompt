import {
    AutoModelForTokenClassification,
    AutoTokenizer,
    env,
    Tensor,
    type PreTrainedModel,
    type PreTrainedTokenizer,
} from '@huggingface/transformers';
import { PipelineCancelledError, type DetectContext, type Span } from '@secureprompt/core';
import { alignTokens } from './align';
import { createWindows } from './windows';

// shared plumbing for token classification: loading, tokenizing with offsets, batched windows

export type DetectorStage = 'tokenize' | 'align' | 'inference' | 'decode';

export type DetectorTiming = {
    now: () => number;
    record: (stage: DetectorStage, milliseconds: number) => void;
};

export type ModelSource = {
    // directory containing <model id>/…, for local files (tests)
    localModelPath?: string;
    // download from Hugging Face if not local, fetching only model files, never text
    allowRemoteModels?: boolean;
    // a mirror with the Hugging Face file layout instead of huggingface.co (browser tests)
    remoteHost?: string;
    // ONNX runtime files packaged with the extension, instead of the default CDN
    runtimeFiles?: { mjs: string; wasm: string };
    // CPU threads for inference in the browser, the runtime's default otherwise
    threads?: number;
    onProgress?: (progress: { status: string; file?: string; progress?: number }) => void;
};

export type ClassifierSpec = {
    modelId: string;
    revision: string;
    dtype: 'q8' | 'q4' | 'q4f16' | 'fp16' | 'fp32';
    device: 'cpu' | 'wasm' | 'webgpu';
    pieceBytes: (piece: string) => Uint8Array;
    // tokens around each window, such as <bos> and <eos>, empty for models without them
    prefixTokens: readonly string[];
    suffixTokens: readonly string[];
    padToken: string;
    windowTokens: number;
    windowOverlap: number;
};

export type LoadedClassifier = {
    tokenizer: PreTrainedTokenizer;
    model: PreTrainedModel;
    id2label: Record<string, string>;
    labelCount: number;
    prefixIds: bigint[];
    suffixIds: bigint[];
    padId: bigint;
};

// the parts of transformers.js' settings that a model source changes
export type RuntimeSettings = {
    localModelPath: string;
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    remoteHost: string;
    useWasmCache: boolean;
    backends: { onnx: { wasm?: { wasmPaths?: unknown; numThreads?: number } } };
};

// applies a model source to transformers.js' global settings, before loading
export const configureRuntime = (settings: RuntimeSettings, source: ModelSource) =>
{
    if (source.localModelPath != null)
    {
        settings.localModelPath = source.localModelPath;
    }

    // without a local path, browsers would first look for model files on the extension's origin
    settings.allowLocalModels = source.localModelPath != null;
    settings.allowRemoteModels = source.allowRemoteModels ?? false;

    if (source.remoteHost != null)
    {
        settings.remoteHost = source.remoteHost;
    }

    if (source.runtimeFiles != null)
    {
        settings.backends.onnx.wasm!.wasmPaths = source.runtimeFiles;
        // packaged files load directly and need no extra cache copy
        settings.useWasmCache = false;
    }

    if (source.threads != null)
    {
        settings.backends.onnx.wasm!.numThreads = source.threads;
    }
};

export const loadClassifier = async (spec: ClassifierSpec, source: ModelSource): Promise<LoadedClassifier> =>
{
    configureRuntime(env, source);

    const shared = {
        revision: spec.revision,
        ...(source.onProgress == null ? {} : { progress_callback: source.onProgress }),
    };
    const tokenizer = await AutoTokenizer.from_pretrained(spec.modelId, shared);
    const model = await AutoModelForTokenClassification.from_pretrained(spec.modelId, {
        ...shared,
        dtype: spec.dtype,
        device: spec.device,
    });
    const id2label = (model.config as unknown as { id2label: Record<string, string> }).id2label;
    const toIds = (tokens: readonly string[]) =>
    {
        return (tokenizer.convert_tokens_to_ids([...tokens]) as number[]).map((id) => BigInt(id));
    };

    return {
        tokenizer,
        model,
        id2label,
        labelCount: Object.keys(id2label).length,
        prefixIds: toIds(spec.prefixTokens),
        suffixIds: toIds(spec.suffixTokens),
        padId: toIds([spec.padToken])[0]!,
    };
};

const timed = async <T>(timing: DetectorTiming | undefined, stage: DetectorStage, run: () => T | Promise<T>) =>
{
    if (timing == null)
    {
        return run();
    }

    const startedAt = timing.now();
    const result = await run();

    timing.record(stage, timing.now() - startedAt);
    return result;
};

export type ClassifiedTokens = {
    ids: number[];
    offsets: Array<Span | null>;
    // mean softmax probabilities per token over all windows that saw it: [token][label]
    probabilities: Float64Array[];
    // how many windows saw each token
    windowCounts: Uint16Array;
};

export const classifyTokens = async (
    text: string,
    spec: ClassifierSpec,
    loaded: LoadedClassifier,
    options: DetectContext & { batchSize?: number; timing?: DetectorTiming } = {},
): Promise<ClassifiedTokens> =>
{
    const checkCancelled = () =>
    {
        if (options.signal?.aborted === true)
        {
            throw new PipelineCancelledError();
        }
    };

    checkCancelled();

    const { tokenizer, model, labelCount, prefixIds, suffixIds, padId } = loaded;
    const { ids, pieces } = await timed(options.timing, 'tokenize', () =>
    {
        return {
            ids: tokenizer.encode(text, { add_special_tokens: false }),
            pieces: tokenizer.tokenize(text),
        };
    });

    if (ids.length !== pieces.length)
    {
        throw new Error('Tokenizer returned inconsistent token counts');
    }

    const offsets = await timed(options.timing, 'align', () => alignTokens(text, pieces.map(spec.pieceBytes)));
    const sums = ids.map(() => new Float64Array(labelCount));
    const counts = new Uint16Array(ids.length);
    const windows = createWindows(ids.length, spec.windowTokens, spec.windowOverlap);
    const batchSize = Math.max(1, options.batchSize ?? 4);

    await timed(options.timing, 'inference', async () =>
    {
        for (let batchStart = 0; batchStart < windows.length; batchStart += batchSize)
        {
            // a pause between batches lets a cancel message arrive, so it takes effect within one batch
            if (batchStart > 0)
            {
                await new Promise((resume) => setTimeout(resume, 0));
            }

            checkCancelled();

            const batch = windows.slice(batchStart, batchStart + batchSize);
            const extra = prefixIds.length + suffixIds.length;
            const sequenceLength = Math.max(...batch.map((window) => window.end - window.start)) + extra;
            const inputIds = new BigInt64Array(batch.length * sequenceLength).fill(padId);
            const attentionMask = new BigInt64Array(batch.length * sequenceLength);

            batch.forEach((window, row) =>
            {
                const content = ids.slice(window.start, window.end).map((id) => BigInt(id));
                const sequence = [...prefixIds, ...content, ...suffixIds];

                inputIds.set(sequence, row * sequenceLength);
                attentionMask.fill(1n, row * sequenceLength, row * sequenceLength + sequence.length);
            });

            const { logits } = (await model({
                input_ids: new Tensor('int64', inputIds, [batch.length, sequenceLength]),
                attention_mask: new Tensor('int64', attentionMask, [batch.length, sequenceLength]),
            })) as { logits: Tensor };
            const data = logits.data as Float32Array;

            batch.forEach((window, row) =>
            {
                for (let token = window.start; token < window.end; token += 1)
                {
                    const position = (row * sequenceLength + prefixIds.length + token - window.start) * labelCount;

                    addSoftmax(data, position, labelCount, sums[token]!);
                    counts[token]! += 1;
                }
            });

            options.onProgress?.((batchStart + batch.length) / windows.length);
        }
    });

    return {
        ids,
        offsets,
        probabilities: sums.map((sum, token) => sum.map((value) => value / Math.max(1, counts[token]!))),
        windowCounts: counts,
    };
};

// adds softmax(data[offset .. offset+length]) to target
const addSoftmax = (data: Float32Array, offset: number, length: number, target: Float64Array) =>
{
    let max = -Infinity;

    for (let index = 0; index < length; index += 1)
    {
        max = Math.max(max, data[offset + index]!);
    }

    let sum = 0;

    for (let index = 0; index < length; index += 1)
    {
        sum += Math.exp(data[offset + index]! - max);
    }

    for (let index = 0; index < length; index += 1)
    {
        target[index]! += Math.exp(data[offset + index]! - max) / sum;
    }
};

export { timed as timeStage };
