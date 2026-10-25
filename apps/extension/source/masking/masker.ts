import {
    createSession,
    detectPipeline,
    maskDetections,
    PipelineCancelledError,
    renderDetections,
    restoreSession,
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
    milliseconds: number;
};

// the model couldn't run, so nothing was masked: names and addresses would go through unmasked
export class ModelFailedError extends Error
{
    override name = 'ModelFailedError';

    constructor()
    {
        super('The model failed, so nothing was masked');
    }
}

// a rule failed, so its findings are missing and the prompt would go out partly unmasked
export class DetectorFailedError extends Error
{
    override name = 'DetectorFailedError';

    constructor()
    {
        super('A detection rule failed, so nothing was masked');
    }
}

export type MaskOptions = {
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
    let generation = 0;

    // rules and model always run together, and a detector that fails stops the run with nothing masked
    const mask = async (input: string, { categories, signal, onModelProgress }: MaskOptions): Promise<MaskRun> =>
    {
        const startedAt = now();
        const startedGeneration = generation;
        const reportingModel: Detector = {
            id: model.id,
            detect: (text, context) => model.detect(text, { ...context, ...(onModelProgress == null ? {} : { onProgress: onModelProgress }) }),
        };
        const detected = await detectPipeline(input, {
            detectors: [...rules, reportingModel],
            session: session.fork(),
            enabledCategories: categories,
            residualPasses: 0,
            ...(signal == null ? {} : { signal }),
        });

        // a reset invalidates the work even if its detector ignored cancellation
        if (signal?.aborted === true || startedGeneration !== generation)
        {
            throw new PipelineCancelledError();
        }

        if (detected.failedDetectors.includes(model.id))
        {
            throw new ModelFailedError();
        }

        // the other detectors are rules, and a missing rule would leave its values unmasked
        if (detected.failedDetectors.length > 0)
        {
            throw new DetectorFailedError();
        }

        // no await between taking the current mappings and publishing their additions
        const nextSession = session.fork();
        const result = renderDetections(input, detected, nextSession);

        session = nextSession;
        return { input, result, milliseconds: now() - startedAt };
    };

    // the run again with spans the user chose, which win over detected values and earlier choices
    const remask = (run: MaskRun, chosen: readonly Detection[], categories: ReadonlySet<Category>): MaskRun =>
    {
        const earlier = run.result.spans
            .map(({ placeholder: _placeholder, ...detection }): Detection => detection)
            .filter((detection) => !chosen.some((choice) => choice.start < detection.end && detection.start < choice.end));
        const result = maskDetections(run.input, earlier.filter((detection) => detection.source !== 'manual'), {
            session,
            enabledCategories: categories,
            manualDetections: [...earlier.filter((detection) => detection.source === 'manual'), ...chosen],
        });

        return { ...run, result: { ...result, failedDetectors: run.result.failedDetectors } };
    };

    const manual = (span: Pick<Detection, 'start' | 'end' | 'category'>, aliasOf?: string): Detection =>
    {
        return { ...span, source: 'manual', detector: 'manual', score: 1, validated: true, ...(aliasOf == null ? {} : { aliasOf }) };
    };

    // a span the user selected in the preview
    const addSelection = (run: MaskRun, selection: Pick<Detection, 'start' | 'end' | 'category'>, categories: ReadonlySet<Category>): MaskRun =>
    {
        return remask(run, [manual(selection)], categories);
    };

    // every mention of a placeholder under another category, still sharing one placeholder
    const relabel = (run: MaskRun, placeholder: string, category: Category, categories: ReadonlySet<Category>): MaskRun =>
    {
        const original = session.originalFor(placeholder);
        const mentions = run.result.spans.filter((span) => span.placeholder === placeholder);

        return mentions.length === 0 ? run : remask(run, mentions.map((span) => manual({ start: span.start, end: span.end, category }, original)), categories);
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
            generation += 1;
            return true;
        }
        catch
        {
            return false;
        }
    };

    const forget = () =>
    {
        generation += 1;
        session = createSession();
    };

    return { mask, addSelection, relabel, originalFor, snapshot, load, forget, size: () => session.placeholders().length };
};

export type Masker = ReturnType<typeof createMasker>;
