import type { DetectContext, Detection, Detector } from '@secureprompt/core';
import { metaspacePieceBytes } from '../align';
import {
    classifyTokens,
    loadClassifier,
    timeStage,
    type ClassifierSpec,
    type DetectorTiming,
    type LoadedClassifier,
    type ModelSource,
} from '../classifier';
import { decodeEvidence } from './decode';
import { createLabelSet, poolEvidence } from './evidence';

export const BARDSAI_MODEL_ID = 'bardsai/eu-pii-anonimization-multilang-v2';
// pinned so every install runs the exact same model files
export const BARDSAI_REVISION = '5e61416e77675881185767fc0c67759d48b35592';

const SPEC: ClassifierSpec = {
    modelId: BARDSAI_MODEL_ID,
    revision: BARDSAI_REVISION,
    // onnx/model_quantized.onnx, CPU-only since ONNX Runtime's WebGPU lacks its quantized ops
    dtype: 'q8',
    device: 'cpu',
    pieceBytes: metaspacePieceBytes,
    prefixTokens: ['<bos>'],
    suffixTokens: ['<eos>'],
    padToken: '<pad>',
    // like the original decoder: 512 tokens with <bos> and <eos>, stride 128
    windowTokens: 510,
    windowOverlap: 128,
};

export type BardsaiDetectorOptions = ModelSource & {
    // 'cpu' in Node, 'wasm' in the browser
    device?: 'cpu' | 'wasm';
    // windows per inference call
    batchSize?: number;
    timing?: DetectorTiming;
};

export type BardsaiDetector = Detector & {
    load: () => Promise<void>;
};

export const createBardsaiDetector = (options: BardsaiDetectorOptions = {}): BardsaiDetector =>
{
    const spec = { ...SPEC, device: options.device ?? SPEC.device };
    let loading: Promise<LoadedClassifier & { labels: ReturnType<typeof createLabelSet> }> | undefined;

    const load = () =>
    {
        loading ??= loadClassifier(spec, options).then((loaded) =>
        {
            return { ...loaded, labels: createLabelSet(loaded.id2label) };
        });

        // a failed load may be retried later
        loading.catch(() =>
        {
            loading = undefined;
        });

        return loading;
    };

    const detect = async (text: string, context: DetectContext = {}): Promise<Detection[]> =>
    {
        if (text.trim().length === 0)
        {
            return [];
        }

        const loaded = await load();
        const tokens = await classifyTokens(text, spec, loaded, {
            ...context,
            ...(options.batchSize == null ? {} : { batchSize: options.batchSize }),
            ...(options.timing == null ? {} : { timing: options.timing }),
        });
        const evidence = poolEvidence(tokens, loaded.labels);

        return timeStage(options.timing, 'decode', () => decodeEvidence(text, evidence));
    };

    return { id: 'model:bardsai-v2', detect, load: async () => void (await load()) };
};
