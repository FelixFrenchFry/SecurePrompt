import { describe, expect, it } from 'vitest';
import { metaspacePieceBytes } from '../../../packages/model-runtime/src/align';
import {
    classifyTokens,
    configureRuntime,
    type ClassifierSpec,
    type LoadedClassifier,
    type RuntimeSettings,
} from '../../../packages/model-runtime/src/classifier';
import { PipelineCancelledError } from '../../../packages/core/src/types';

const SPEC: ClassifierSpec = {
    modelId: 'test/model',
    revision: 'test',
    dtype: 'q8',
    device: 'cpu',
    pieceBytes: metaspacePieceBytes,
    prefixTokens: [],
    suffixTokens: [],
    padToken: '<pad>',
    windowTokens: 4,
    windowOverlap: 2,
};

// one token per word, and a model that gives label 1 to token id 3 and label 0 to everything else
const fakeClassifier = (calls: { count: number } = { count: 0 }): LoadedClassifier =>
{
    const words = (text: string) => text.split(' ');
    const tokenizer = {
        encode: (text: string) => words(text).map((_, index) => index + 1),
        tokenize: (text: string) => words(text).map((word) => `▁${word}`),
    };
    const model = async ({ input_ids }: { input_ids: { data: BigInt64Array } }) =>
    {
        calls.count += 1;

        return { logits: { data: Float32Array.from([...input_ids.data].flatMap((id) => (id === 3n ? [-5, 5] : [5, -5]))) } };
    };

    return { tokenizer, model, id2label: { 0: 'O', 1: 'B-NAME' }, labelCount: 2, prefixIds: [], suffixIds: [], padId: 0n } as unknown as LoadedClassifier;
};

describe('classifyTokens', () =>
{
    it('averages tokens seen by several windows', async () =>
    {
        const result = await classifyTokens('a b c d e f', SPEC, fakeClassifier());

        expect([...result.windowCounts]).toEqual([1, 1, 2, 2, 1, 1]);
        expect(result.probabilities[2]![1]).toBeGreaterThan(0.99);
        expect(result.probabilities[3]![0]).toBeGreaterThan(0.99);
        expect(result.offsets[1]).toEqual({ start: 1, end: 3 });
    });

    it('reports progress after each batch of windows', async () =>
    {
        const progress: number[] = [];

        await classifyTokens('a b c d e f', SPEC, fakeClassifier(), { batchSize: 1, onProgress: (fraction) => progress.push(fraction) });

        expect(progress).toEqual([0.5, 1]);
    });

    it('records the time of each stage with the injected clock', async () =>
    {
        const recorded: string[] = [];
        let now = 0;

        await classifyTokens('a b c', SPEC, fakeClassifier(), {
            timing: { now: () => (now += 1), record: (stage, milliseconds) => recorded.push(`${stage} ${milliseconds}`) },
        });

        expect(recorded).toEqual(['tokenize 1', 'align 1', 'inference 1']);
    });

    it('stops before the next batch once cancelled', async () =>
    {
        const controller = new AbortController();
        const calls = { count: 0 };
        const run = classifyTokens('a b c d e f', SPEC, fakeClassifier(calls), {
            batchSize: 1,
            signal: controller.signal,
            onProgress: () => controller.abort(),
        });

        await expect(run).rejects.toBeInstanceOf(PipelineCancelledError);
        expect(calls.count).toBe(1);
    });

    it('rejects when the tokenizer returns inconsistent token counts', async () =>
    {
        const classifier = fakeClassifier();

        (classifier.tokenizer as unknown as { tokenize: () => string[] }).tokenize = () => ['▁a'];

        await expect(classifyTokens('a b', SPEC, classifier)).rejects.toThrow('inconsistent token counts');
    });
});

describe('configureRuntime', () =>
{
    // transformers.js' defaults, as far as a model source changes them
    const defaults = (): RuntimeSettings => ({
        localModelPath: '/models/',
        allowLocalModels: true,
        allowRemoteModels: true,
        remoteHost: 'https://huggingface.co/',
        useWasmCache: true,
        backends: { onnx: { wasm: {} } },
    });

    it('loads from a local folder only, as in tests', () =>
    {
        const settings = defaults();

        configureRuntime(settings, { localModelPath: '.models/' });

        expect(settings).toMatchObject({ localModelPath: '.models/', allowLocalModels: true, allowRemoteModels: false });
    });

    it('downloads without looking on the extension origin first, as in the browser', () =>
    {
        const settings = defaults();

        configureRuntime(settings, { allowRemoteModels: true });

        expect(settings).toMatchObject({ allowLocalModels: false, allowRemoteModels: true, remoteHost: 'https://huggingface.co/' });
    });

    it('uses a mirror, packaged runtime files and a thread count when given', () =>
    {
        const settings = defaults();
        const runtimeFiles = { mjs: 'ort.mjs', wasm: 'ort.wasm' };

        configureRuntime(settings, { allowRemoteModels: true, remoteHost: 'http://127.0.0.1:1/', runtimeFiles, threads: 6 });

        expect(settings).toMatchObject({ remoteHost: 'http://127.0.0.1:1/', useWasmCache: false });
        expect(settings.backends.onnx.wasm).toEqual({ wasmPaths: runtimeFiles, numThreads: 6 });
    });

    it('leaves the runtime files, cache and threads alone otherwise', () =>
    {
        const settings = defaults();

        configureRuntime(settings, {});

        expect(settings).toMatchObject({ useWasmCache: true, backends: { onnx: { wasm: {} } } });
        expect(settings.backends.onnx.wasm).toEqual({});
    });
});
