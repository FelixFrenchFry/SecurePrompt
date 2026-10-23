import {
    createSession,
    maskDetections,
    restoreSession,
    runPipeline,
    type Category,
    type CancelSignal,
    type Detection,
    type Detector,
    type PipelineResult,
    type SessionSnapshot,
} from '@secureprompt/core';

export type MaskRun = {
    // the text that was masked: the prompt with its files
    input: string;
    result: PipelineResult;
    // the model was asked to run but failed, so the result comes from the rules only
    modelFailed: boolean;
    milliseconds: number;
};

export type MaskOptions = {
    useModel: boolean;
    categories: ReadonlySet<Category>;
    signal?: CancelSignal;
    // the model's own progress, 0 to 1, as the rules finish at once and would make it jump
    onModelProgress?: (fraction: number) => void;
};

export type MaskerOptions = {
    rules: readonly Detector[];
    model: Detector;
    now?: () => number;
};

// masks prompts with one session, so a value keeps its placeholder across prompts
export const createMasker = (options: MaskerOptions) =>
{
    const { rules, model, now = () => performance.now() } = options;
    let session = createSession();

    const mask = async (input: string, { useModel, categories, signal, onModelProgress }: MaskOptions): Promise<MaskRun> =>
    {
        const startedAt = now();
        const reportingModel: Detector = {
            id: model.id,
            detect: (text, context) => model.detect(text, { ...context, ...(onModelProgress == null ? {} : { onProgress: onModelProgress }) }),
        };
        const result = await runPipeline(input, {
            detectors: useModel ? [...rules, reportingModel] : rules,
            session,
            enabledCategories: categories,
            residualPasses: 0,
            ...(signal == null ? {} : { signal }),
        });

        return { input, result, modelFailed: useModel && result.failedDetectors.includes(model.id), milliseconds: now() - startedAt };
    };

    // the run again with a span the user selected, which wins over detected values
    const addSelection = (run: MaskRun, selection: Pick<Detection, 'start' | 'end' | 'category'>, categories: ReadonlySet<Category>): MaskRun =>
    {
        const earlier = run.result.spans.map(({ placeholder: _placeholder, ...detection }): Detection => detection);
        const manual: Detection = { ...selection, source: 'manual', detector: 'manual', score: 1, validated: true };
        const result = maskDetections(run.input, earlier.filter((detection) => detection.source !== 'manual'), {
            session,
            enabledCategories: categories,
            manualDetections: [...earlier.filter((detection) => detection.source === 'manual'), manual],
        });

        return { ...run, result: { ...result, failedDetectors: run.result.failedDetectors } };
    };

    const originalFor = (placeholder: string): string | undefined => session.originalFor(placeholder);

    // the session as plain data, only for memory-only storage (chrome.storage.session)
    const snapshot = (): SessionSnapshot => session.snapshot();

    // continues a stored session, or keeps the current one if the stored data is broken
    const load = (stored: unknown): boolean =>
    {
        try
        {
            session = restoreSession(stored as SessionSnapshot);
            return true;
        }
        catch
        {
            return false;
        }
    };

    const forget = () =>
    {
        session = createSession();
    };

    return { mask, addSelection, originalFor, snapshot, load, forget, size: () => session.placeholders().length };
};

export type Masker = ReturnType<typeof createMasker>;
