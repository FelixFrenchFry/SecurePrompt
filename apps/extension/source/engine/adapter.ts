import {
    CATEGORIES,
    maskDetections,
    restoreSession,
    RULE_NAMES,
    RULES,
    runPipeline,
    type Category,
    type Detection,
    type Detector,
    type MaskSession,
    type PipelineResult,
    type PipelineStage,
    type SessionSnapshot,
} from '@secureprompt/core';
import type {
    DetectionSource,
    LocalModelProgressCallback,
    ManualSensitiveItemInput,
    ManualSensitiveItemOptions,
    MaskingMapping,
    PrivacyBenchmarkStageTiming,
    PrivatizationPipelineOptions,
    PrivatizedPromptPreview,
    PrivatizedPromptPreviewOptions,
    PrivatizedPromptResult,
    PrivatizedPromptSegment,
    SensitiveItem,
} from './types';

// the side panel's engine functions, backed by the new pipeline

// the side panel shows this label specially, the pipeline runs no second model pass
export const LOCAL_MODEL_MISSED_VALUES_PROGRESS_LABEL = 'Checking missed values...';

export class LocalModelFailedError extends Error
{
    override name = 'LocalModelFailedError';

    constructor()
    {
        super('The local model could not run');
    }
}

export type ModelLoadingUpdate = { status: string; file?: string; progress?: number; loaded?: number; total?: number };

const enabledCategorySet = (enabled: Partial<Record<Category, boolean>> | undefined): ReadonlySet<Category> =>
{
    return new Set(CATEGORIES.filter((category) => enabled?.[category] !== false));
};

// a session holding the bundle's placeholders, skipping entries that conflict with earlier ones
const sessionFromMappings = (mappings: readonly MaskingMapping[]): MaskSession =>
{
    const entries: SessionSnapshot['entries'] = [];

    for (const mapping of mappings)
    {
        const entry = { category: mapping.category, value: mapping.original, placeholder: mapping.mask };

        try
        {
            restoreSession({ entries: [...entries, entry] });
            entries.push(entry);
        }
        catch
        {
            // a value or placeholder already taken keeps its first mapping
        }
    }

    return restoreSession({ entries });
};

const itemSource = (detection: Detection): DetectionSource =>
{
    return detection.source === 'model' || detection.source === 'manual' ? detection.source : 'rules';
};

// an earlier item as a detection, still linked to the value its placeholder stands for, so a
// surname masked under the full name's placeholder keeps it ("Neumann" for "Claudia Neumann")
const toDetection = (item: SensitiveItem, original: string | undefined): Detection =>
{
    return {
        start: item.start,
        end: item.end,
        category: item.category,
        source: item.source === 'rules' ? 'rule' : item.source,
        detector: `earlier:${item.source}`,
        score: item.confidence,
        validated: false,
        ...(original == null || original === item.value ? {} : { aliasOf: original }),
    };
};

// converts a pipeline result into the side panel's result shape
const toResult = (text: string, result: PipelineResult, session: MaskSession, safeToInject: boolean): PrivatizedPromptResult =>
{
    const items = result.spans.map((span, index): SensitiveItem =>
    {
        return {
            id: `item-${index + 1}`,
            category: span.category,
            start: span.start,
            end: span.end,
            value: text.slice(span.start, span.end),
            confidence: span.score,
            source: itemSource(span),
        };
    });
    const mappings = new Map<string, MaskingMapping>();

    result.spans.forEach((span, index) =>
    {
        const mapping = mappings.get(span.placeholder) ?? {
            id: span.placeholder,
            category: span.category,
            original: session.originalFor(span.placeholder) ?? items[index]!.value,
            mask: span.placeholder,
            itemIds: [],
        };

        mapping.itemIds.push(items[index]!.id);
        mappings.set(span.placeholder, mapping);
    });

    const segments = result.segments.map((segment): PrivatizedPromptSegment =>
    {
        if (segment.kind === 'text')
        {
            return {
                type: 'text',
                text: result.maskedText.slice(segment.maskedStart, segment.maskedEnd),
                sourceStart: segment.sourceStart,
                sourceEnd: segment.sourceEnd,
            };
        }

        return {
            type: 'mask',
            text: segment.placeholder,
            category: segment.category,
            original: session.originalFor(segment.placeholder) ?? text.slice(segment.sourceStart, segment.sourceEnd),
            mappingId: segment.placeholder,
            sourceStart: segment.sourceStart,
            sourceEnd: segment.sourceEnd,
        };
    });

    return { method: 'placeholder', privatizedPrompt: result.maskedText, segments, items, maskingMappings: [...mappings.values()], safeToInject };
};

const BENCHMARK_STAGES: Record<PipelineStage, { stage: PrivacyBenchmarkStageTiming['stage']; label: string }> = {
    detect: { stage: 'rulesDetection', label: 'Rules scan' },
    prepare: { stage: 'resultAssembly', label: 'Overlaps and mentions' },
    residualDetect: { stage: 'rulesHardening', label: 'Second scan' },
    residualMap: { stage: 'rulesHardening', label: 'Second scan' },
    render: { stage: 'finalization', label: 'Masked output' },
};

export const createEngine = (options: { modelDetector: Detector }) =>
{
    // the model's loading updates go to the run that is waiting for it
    let activeProgress: LocalModelProgressCallback | undefined;
    // bytes per model file, as files download in parallel and in two separate loading steps
    const downloads = new Map<string, { loaded: number; total: number }>();
    let downloadPercent = 0;

    const handleModelLoading = (update: ModelLoadingUpdate) =>
    {
        if (update.status === 'progress' && update.file != null && update.loaded != null && update.total != null && update.total > 0)
        {
            downloads.set(update.file, { loaded: update.loaded, total: update.total });

            const sizes = [...downloads.values()];
            const loadedBytes = sizes.reduce((sum, size) => sum + size.loaded, 0);
            const totalBytes = sizes.reduce((sum, size) => sum + size.total, 0);

            // a file starting later adds to the total, the bar still never moves backwards
            downloadPercent = Math.max(downloadPercent, Math.min(100, (loadedBytes / totalBytes) * 100));
            activeProgress?.({ phase: 'download', label: 'Downloading model...', progress: downloadPercent, loadedBytes, totalBytes });
        }
        else if (update.status === 'ready')
        {
            activeProgress?.({ phase: 'load', label: 'Loading model...' });
        }
    };

    const createPrivatizedPromptAsync = async (text: string, runOptions: PrivatizationPipelineOptions = {}): Promise<PrivatizedPromptResult> =>
    {
        const useRules = runOptions.useRulesDetection ?? true;
        const useModel = runOptions.useLocalModelDetection ?? false;
        const enabled = enabledCategorySet(runOptions.enabledCategories);
        const session = sessionFromMappings(runOptions.preferredMaskingMappings ?? []);
        const report = useModel ? runOptions.onLocalModelProgress : undefined;
        const stages: PrivacyBenchmarkStageTiming[] = [];
        const startedAt = Date.now();
        const totalStartedAt = performance.now();

        // timings only, merged per side panel stage
        const record = (stage: PipelineStage, durationMs: number) =>
        {
            const target = stage === 'detect' && useModel ? { stage: 'modelDetection' as const, label: 'Model and rules scan' } : BENCHMARK_STAGES[stage];
            const existing = stages.find((timing) => timing.stage === target.stage);

            if (existing == null)
            {
                stages.push({ ...target, durationMs });
            }
            else
            {
                existing.durationMs += durationMs;
            }
        };

        activeProgress = report;

        // the scan progress is the model's own, the rules finish at once and would make it jump
        const modelDetector: Detector = {
            id: options.modelDetector.id,
            detect: (input, context) =>
            {
                return options.modelDetector.detect(input, {
                    ...context,
                    onProgress: (fraction) => report?.({ phase: 'inference', label: 'Scanning input...', progress: Math.round(fraction * 100) }),
                });
            },
        };

        try
        {
            const result = await runPipeline(text, {
                detectors: [...(useRules ? RULE_NAMES.map((name) => RULES[name]) : []), ...(useModel ? [modelDetector] : [])],
                session,
                enabledCategories: enabled,
                residualPasses: 0,
                timing: { now: () => performance.now(), record },
            });

            // the side panel falls back to a rules-only preview when the model fails
            if (useModel && result.failedDetectors.includes(options.modelDetector.id))
            {
                throw new LocalModelFailedError();
            }

            report?.({ phase: 'postprocess', label: 'Creating masked output...' });

            const safeToInject = (useRules || useModel) && enabled.size > 0 && result.failedDetectors.length === 0;
            const converted = toResult(text, result, session, safeToInject);

            runOptions.onBenchmark?.({
                startedAt,
                completedAt: Date.now(),
                totalDurationMs: performance.now() - totalStartedAt,
                inputCharacters: text.length,
                inputLines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length,
                rulesEnabled: useRules,
                localModelEnabled: useModel,
                safeToInject,
                itemCount: converted.items.length,
                hardeningItemCount: 0,
                stages,
            });

            return converted;
        }
        finally
        {
            if (activeProgress === report)
            {
                activeProgress = undefined;
            }
        }
    };

    return { createPrivatizedPromptAsync, handleModelLoading };
};

// the masked text with the ignored mappings' values shown as they are
export const createPrivatizedPromptPreview = (
    text: string,
    result: Pick<PrivatizedPromptResult, 'items' | 'maskingMappings' | 'method'>,
    options: PrivatizedPromptPreviewOptions = {},
): PrivatizedPromptPreview =>
{
    const ignored = new Set(options.ignoredMappingIds ?? []);
    const mappingOfItem = new Map(result.maskingMappings.flatMap((mapping) => mapping.itemIds.map((id) => [id, mapping] as const)));
    const segments: PrivatizedPromptSegment[] = [];
    let cursor = 0;

    const addText = (start: number, end: number) =>
    {
        const previous = segments.at(-1);

        if (end <= start)
        {
            return;
        }

        if (previous?.type === 'text' && previous.sourceEnd === start)
        {
            segments[segments.length - 1] = { ...previous, text: previous.text + text.slice(start, end), sourceEnd: end };
            return;
        }

        segments.push({ type: 'text', text: text.slice(start, end), sourceStart: start, sourceEnd: end });
    };

    for (const item of [...result.items].sort((left, right) => left.start - right.start))
    {
        const mapping = mappingOfItem.get(item.id);

        if (item.start < cursor)
        {
            continue;
        }

        addText(cursor, item.start);

        if (mapping == null || ignored.has(mapping.id))
        {
            addText(item.start, item.end);
        }
        else
        {
            segments.push({
                type: 'mask',
                text: mapping.mask,
                category: mapping.category,
                original: mapping.original,
                mappingId: mapping.id,
                sourceStart: item.start,
                sourceEnd: item.end,
            });
        }

        cursor = item.end;
    }

    addText(cursor, text.length);

    return { privatizedPrompt: segments.map((segment) => segment.text).join(''), segments };
};

// the result again with a selection the user marked, which wins over detected values
export const createPrivatizedPromptWithManualItem = (
    text: string,
    result: Pick<PrivatizedPromptResult, 'items' | 'maskingMappings' | 'safeToInject'>,
    input: ManualSensitiveItemInput,
    options: ManualSensitiveItemOptions = {},
): PrivatizedPromptResult =>
{
    const session = sessionFromMappings(options.preferredMaskingMappings ?? result.maskingMappings);
    const manual: Detection = { start: input.start, end: input.end, category: input.category, source: 'manual', detector: 'manual', score: 1, validated: true };
    const originalOfItem = new Map(result.maskingMappings.flatMap((mapping) => mapping.itemIds.map((id) => [id, mapping.original] as const)));
    const masked = maskDetections(text, result.items.map((item) => toDetection(item, originalOfItem.get(item.id))), {
        session,
        enabledCategories: enabledCategorySet(options.enabledCategories),
        manualDetections: [manual],
    });

    return toResult(text, masked, session, result.safeToInject);
};

