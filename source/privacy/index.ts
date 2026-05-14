import {
    DEFAULT_PRIVATIZATION_METHOD,
    USE_LOCAL_MODEL_DETECTION,
    USE_RULES_DETECTION,
} from './config';
import { detectSensitiveItemsWithLocalModel } from './detect/local-model-based/detection-local-model-based';
import { detectAccountItems } from './detect/rule-based/detect-account-items';
import {
    detectDateItems,
    isClearlyInvalidDateItem,
} from './detect/rule-based/detect-date-items';
import { detectEmailItems } from './detect/rule-based/detect-email-items';
import { detectNetworkItems } from './detect/rule-based/detect-network-items';
import { detectPhoneItems } from './detect/rule-based/detect-phone-items';
import { detectSecretItems } from './detect/rule-based/detect-secret-items';
import { detectSensitiveItemsWithRules } from './detect/rule-based/detection-rule-based';
import type {
    LocalModelProgressCallback,
    MaskingMapping,
    PrivacyBenchmark,
    PrivacyBenchmarkCallback,
    PrivacyBenchmarkStage,
    PrivacyBenchmarkStageTiming,
    PrivatizationMethod,
    PrivatizedPromptPreview,
    PrivatizedPromptResult,
    PrivatizedPromptSegment,
    SensitiveItem,
    SensitiveItemCategory,
} from './types';

export type {
    DetectionSource,
    LocalModelProgress,
    LocalModelProgressCallback,
    LocalModelProgressPhase,
    MaskingMapping,
    PrivacyBenchmark,
    PrivacyBenchmarkCallback,
    PrivacyBenchmarkStage,
    PrivacyBenchmarkStageTiming,
    PrivatizationMethod,
    PrivatizedPromptPreview,
    PrivatizedPromptResult,
    PrivatizedPromptSegment,
    SensitiveItem,
    SensitiveItemCategory,
} from './types';

export { DEFAULT_PRIVATIZATION_METHOD } from './config';

export type PrivatizationPipelineOptions = {
    useLocalModelDetection?: boolean;
    useRulesDetection?: boolean;
    enabledCategories?: Partial<Record<SensitiveItemCategory, boolean>>;
    preferredMaskingMappings?: readonly MaskingMapping[];
    onLocalModelProgress?: LocalModelProgressCallback;
    onBenchmark?: PrivacyBenchmarkCallback;
};

export type PrivatizedPromptPreviewOptions = {
    ignoredMappingIds?: readonly string[];
};

export type ManualSensitiveItemInput = {
    category: SensitiveItemCategory;
    start: number;
    end: number;
};

export type ManualSensitiveItemOptions = {
    enabledCategories?: Partial<Record<SensitiveItemCategory, boolean>>;
    preferredMaskingMappings?: readonly MaskingMapping[];
};

type PrivatizedPromptFromItemsOptions = {
    preferredMaskingMappings?: readonly MaskingMapping[];
    useResidualRulesDetection?: boolean;
    enabledCategories?: Partial<Record<SensitiveItemCategory, boolean>>;
    safeToInject?: boolean;
    benchmark?: PrivacyBenchmarkRecorder;
};

type TextRange = {
    start: number;
    end: number;
};

type ResidualDetectionPart = TextRange & {
    sourceStart: number;
};

type ResidualDetectionInput = {
    text: string;
    parts: ResidualDetectionPart[];
    protectedRanges: TextRange[];
};

type PrivacyBenchmarkRecorder = {
    measure: <T>(
        stage: PrivacyBenchmarkStage,
        label: string,
        callback: () => T,
        getItemCount?: (value: T) => number | undefined,
    ) => T;
    measureAsync: <T>(
        stage: PrivacyBenchmarkStage,
        label: string,
        callback: () => Promise<T>,
        getItemCount?: (value: T) => number | undefined,
    ) => Promise<T>;
    finish: (
        result: PrivatizedPromptResult,
        rulesEnabled: boolean,
        localModelEnabled: boolean,
    ) => void;
};

const RESIDUAL_PLACEHOLDER_PATTERN =
    /(?:EMAIL|PHONE|PERSON|ADDRESS|ACCOUNT|DATE|NETWORK|SECRET|OTHER)_\d{3,}/g;
const RESIDUAL_PLACEHOLDER_VALUE_PATTERN =
    /^(?:EMAIL|PHONE|PERSON|ADDRESS|ACCOUNT|DATE|NETWORK|SECRET|OTHER)_\d{3,}$/;

const SENSITIVE_ITEM_CATEGORY_PRIORITY: SensitiveItemCategory[] = [
    'SECRET',
    'ACCOUNT',
    'EMAIL',
    'PHONE',
    'ADDRESS',
    'PERSON',
    'NETWORK',
    'DATE',
    'OTHER',
];

const AUTHORITATIVE_RULE_CATEGORIES = new Set<SensitiveItemCategory>([
    'EMAIL',
    'PHONE',
    'ACCOUNT',
    'DATE',
    'NETWORK',
    'SECRET',
]);

const RESIDUAL_RULE_CATEGORIES = new Set<SensitiveItemCategory>([
    'EMAIL',
    'PHONE',
    'ACCOUNT',
    'DATE',
    'NETWORK',
    'SECRET',
]);

const RESIDUAL_MODEL_CATEGORIES = new Set<SensitiveItemCategory>([
    'EMAIL',
    'PHONE',
    'ADDRESS',
    'ACCOUNT',
    'NETWORK',
    'SECRET',
]);

const filterSensitiveItemsByEnabledCategories = (
    items: SensitiveItem[],
    enabledCategories: Partial<Record<SensitiveItemCategory, boolean>> | undefined,
) =>
{
    if (enabledCategories == null)
    {
        return items;
    }

    return items.filter((item) =>
    {
        return enabledCategories[item.category] !== false;
    });
};

const getEnabledCategorySet = (
    categories: ReadonlySet<SensitiveItemCategory>,
    enabledCategories: Partial<Record<SensitiveItemCategory, boolean>> | undefined,
) =>
{
    if (enabledCategories == null)
    {
        return categories;
    }

    return new Set(
        [...categories].filter((category) =>
        {
            return enabledCategories[category] !== false;
        }),
    );
};

const hasEnabledSensitiveItemCategories = (
    enabledCategories: Partial<Record<SensitiveItemCategory, boolean>> | undefined,
) =>
{
    if (enabledCategories == null)
    {
        return true;
    }

    return SENSITIVE_ITEM_CATEGORY_PRIORITY.some((category) =>
    {
        return enabledCategories[category] !== false;
    });
};

const canInjectPrivatizedPrompt = (
    useRulesDetection: boolean,
    useLocalModelDetection: boolean,
    enabledCategories: Partial<Record<SensitiveItemCategory, boolean>> | undefined,
) =>
{
    return (
        (useRulesDetection || useLocalModelDetection) &&
        hasEnabledSensitiveItemCategories(enabledCategories)
    );
};

const getNow = () =>
{
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
};

const createPrivacyBenchmarkRecorder = (
    inputText: string,
    onBenchmark: PrivacyBenchmarkCallback | undefined,
): PrivacyBenchmarkRecorder | undefined =>
{
    if (onBenchmark == null)
    {
        return undefined;
    }

    const startedAt = Date.now();
    const totalStartedAt = getNow();
    const stages: PrivacyBenchmarkStageTiming[] = [];

    const recordStage = (
        stage: PrivacyBenchmarkStage,
        label: string,
        durationMs: number,
        itemCount?: number,
    ) =>
    {
        const existingStage = stages.find((timing) =>
        {
            return timing.stage === stage;
        });

        if (existingStage != null)
        {
            existingStage.durationMs += durationMs;

            if (itemCount != null)
            {
                existingStage.itemCount = (existingStage.itemCount ?? 0) + itemCount;
            }

            return;
        }

        stages.push({
            stage,
            label,
            durationMs,
            itemCount,
        });
    };

    const measure = <T>(
        stage: PrivacyBenchmarkStage,
        label: string,
        callback: () => T,
        getItemCount?: (value: T) => number | undefined,
    ): T =>
    {
        const startedAt = getNow();

        try
        {
            const value = callback();
            recordStage(stage, label, getNow() - startedAt, getItemCount?.(value));
            return value;
        }
        catch (error)
        {
            recordStage(stage, label, getNow() - startedAt);
            throw error;
        }
    };

    const measureAsync = async <T>(
        stage: PrivacyBenchmarkStage,
        label: string,
        callback: () => Promise<T>,
        getItemCount?: (value: T) => number | undefined,
    ): Promise<T> =>
    {
        const startedAt = getNow();

        try
        {
            const value = await callback();
            recordStage(stage, label, getNow() - startedAt, getItemCount?.(value));
            return value;
        }
        catch (error)
        {
            recordStage(stage, label, getNow() - startedAt);
            throw error;
        }
    };

    return {
        measure,
        measureAsync,
        finish: (result, rulesEnabled, localModelEnabled) =>
        {
            const completedAt = Date.now();
            const hardeningItemCount = stages
                .filter((stage) =>
                {
                    return stage.stage === 'rulesHardening' || stage.stage === 'modelHardening';
                })
                .reduce((count, stage) =>
                {
                    return count + (stage.itemCount ?? 0);
                }, 0);

            onBenchmark({
                startedAt,
                completedAt,
                totalDurationMs: getNow() - totalStartedAt,
                inputCharacters: inputText.length,
                inputLines: inputText.length === 0 ? 0 : inputText.split(/\r\n|\r|\n/).length,
                rulesEnabled,
                localModelEnabled,
                safeToInject: result.safeToInject,
                itemCount: result.items.length,
                hardeningItemCount,
                stages: stages.map((stage) =>
                {
                    return { ...stage };
                }),
            });
        },
    };
};

// sync (rules-only) pipeline
export const createPrivatizedPrompt = (inputText: string): PrivatizedPromptResult =>
{
    const useRulesDetection = USE_RULES_DETECTION;
    const detectedItems = detectSensitiveItemsSync(inputText, {
        useRulesDetection,
    });

    return createPrivatizedPromptFromItems(inputText, detectedItems, {
        useResidualRulesDetection: useRulesDetection,
        safeToInject: canInjectPrivatizedPrompt(useRulesDetection, false, undefined),
    });
};

// async pipeline for detection with local model
export const createPrivatizedPromptAsync = async (
    inputText: string,
    options: PrivatizationPipelineOptions = {},
): Promise<PrivatizedPromptResult> =>
{
    const useRulesDetection = options.useRulesDetection ?? USE_RULES_DETECTION;
    const useLocalModelDetection =
        options.useLocalModelDetection ?? USE_LOCAL_MODEL_DETECTION;
    const benchmark = createPrivacyBenchmarkRecorder(inputText, options.onBenchmark);
    const safeToInject = canInjectPrivatizedPrompt(
        useRulesDetection,
        useLocalModelDetection,
        options.enabledCategories,
    );
    const detectedItems: SensitiveItem[] = [];
    const rulesItems = benchmark
        ? benchmark.measure(
              'rulesDetection',
              'Rules scan',
              () => detectSensitiveItemsSync(inputText, options),
              (items) => items.length,
          )
        : detectSensitiveItemsSync(inputText, options);

    detectedItems.push(...rulesItems);

    if (useLocalModelDetection)
    {
        const detectEnabledModelItems = async () =>
        {
            return filterSensitiveItemsByEnabledCategories(
                await detectSensitiveItemsWithLocalModel(
                    inputText,
                    options.onLocalModelProgress,
                ),
                options.enabledCategories,
            );
        };
        const modelItems = await (benchmark
            ? benchmark.measureAsync(
                  'modelDetection',
                  'Model scan',
                  detectEnabledModelItems,
                  (items) => items.length,
              )
            : detectEnabledModelItems());

        detectedItems.push(...modelItems);
    }

    if (useLocalModelDetection)
    {
        await reportPipelinePostprocessProgress(
            options.onLocalModelProgress,
            'Creating masked output...',
        );
    }

    const filteredItems = filterInvalidModelDateItems(
        inputText,
        filterProtectedPlaceholderItems(inputText, detectedItems),
    );
    const result = createPrivatizedPromptFromItems(
        inputText,
        filterSensitiveItemsByEnabledCategories(
            filteredItems,
            options.enabledCategories,
        ),
        {
            preferredMaskingMappings: options.preferredMaskingMappings,
            useResidualRulesDetection: useRulesDetection,
            enabledCategories: options.enabledCategories,
            safeToInject,
            benchmark,
        },
    );

    if (!useLocalModelDetection)
    {
        benchmark?.finish(result, useRulesDetection, useLocalModelDetection);
        return result;
    }

    try
    {
        const residualItems = await (benchmark
            ? benchmark.measureAsync(
                  'modelHardening',
                  'Model hardening',
                  () =>
                      detectResidualSensitiveItemsWithLocalModel(
                          inputText,
                          result,
                          options.onLocalModelProgress,
                          options.enabledCategories,
                      ),
                  (items) => items.length,
              )
            : detectResidualSensitiveItemsWithLocalModel(
                  inputText,
                  result,
                  options.onLocalModelProgress,
                  options.enabledCategories,
              ));

        await reportPipelinePostprocessProgress(
            options.onLocalModelProgress,
            'Finalizing output...',
        );

        const hardenedResult = benchmark
            ? benchmark.measure(
                  'finalization',
                  'Finalize result',
                  () => hardenPrivatizedPromptResult(inputText, result, residualItems),
              )
            : hardenPrivatizedPromptResult(inputText, result, residualItems);

        benchmark?.finish(hardenedResult, useRulesDetection, useLocalModelDetection);

        return hardenedResult;
    }
    catch
    {
        const unsafeResult = {
            ...result,
            safeToInject: false,
        };

        benchmark?.finish(unsafeResult, useRulesDetection, useLocalModelDetection);
        return unsafeResult;
    }
};

export const createPrivatizedPromptPreview = (
    inputText: string,
    result: Pick<PrivatizedPromptResult, 'items' | 'maskingMappings' | 'method'>,
    options: PrivatizedPromptPreviewOptions = {},
): PrivatizedPromptPreview =>
{
    return applyMasksToItems(
        inputText,
        result.items,
        result.maskingMappings,
        result.method,
        new Set(options.ignoredMappingIds ?? []),
    );
};

export const createPrivatizedPromptWithManualItem = (
    inputText: string,
    result: Pick<
        PrivatizedPromptResult,
        'items' | 'maskingMappings' | 'safeToInject'
    >,
    manualItemInput: ManualSensitiveItemInput,
    options: ManualSensitiveItemOptions = {},
): PrivatizedPromptResult =>
{
    const manualItem = createManualSensitiveItem(
        inputText,
        result.items,
        manualItemInput,
    );
    const existingItems = protectExistingManualItems(
        inputText,
        result.items,
        manualItem,
    );
    const resultWithManualItem = createPrivatizedPromptFromItems(
        inputText,
        [
            ...existingItems,
            manualItem,
        ],
        {
            preferredMaskingMappings:
                options.preferredMaskingMappings ?? result.maskingMappings,
            enabledCategories: options.enabledCategories,
        },
    );

    return {
        ...resultWithManualItem,
        safeToInject: result.safeToInject,
    };
};

const protectExistingManualItems = (
    inputText: string,
    items: SensitiveItem[],
    manualItem: SensitiveItem,
): SensitiveItem[] =>
{
    const protectedItems: SensitiveItem[] = [];

    for (const item of items)
    {
        if (item.source !== 'manual' || !sensitiveItemsOverlap(item, manualItem))
        {
            protectedItems.push(item);
            continue;
        }

        protectedItems.push(
            ...splitSensitiveItemAroundBlockingItems(inputText, item, [manualItem]),
        );
    }

    return protectedItems;
};

const createPrivatizedPromptFromItems = (
    inputText: string,
    detectedItems: SensitiveItem[],
    options: PrivatizedPromptFromItemsOptions = {},
): PrivatizedPromptResult =>
{
    const benchmark = options.benchmark;
    const result = benchmark
        ? benchmark.measure(
              'resultAssembly',
              'Build preview',
              () => createInitialPrivatizedPromptResult(inputText, detectedItems, options),
              (initialResult) => initialResult.items.length,
          )
        : createInitialPrivatizedPromptResult(inputText, detectedItems, options);
    const useResidualRulesDetection =
        options.useResidualRulesDetection ?? USE_RULES_DETECTION;
    const residualItems = useResidualRulesDetection
        ? benchmark
            ? benchmark.measure(
                  'rulesHardening',
                  'Rules hardening',
                  () =>
                      detectResidualSensitiveItemsWithRules(
                          inputText,
                          result,
                          options.enabledCategories,
                      ),
                  (items) => items.length,
              )
            : detectResidualSensitiveItemsWithRules(
                  inputText,
                  result,
                  options.enabledCategories,
              )
        : [];

    return benchmark
        ? benchmark.measure(
              'finalization',
              'Finalize result',
              () => hardenPrivatizedPromptResult(inputText, result, residualItems),
          )
        : hardenPrivatizedPromptResult(inputText, result, residualItems);
};

const createInitialPrivatizedPromptResult = (
    inputText: string,
    detectedItems: SensitiveItem[],
    options: PrivatizedPromptFromItemsOptions = {},
): PrivatizedPromptResult =>
{
    // 1. resolve overlaps and conflicts between detected items
    const finalItems = resolveSensitiveItemOverlaps(inputText, detectedItems);

    // 2. create many-to-one masking mappings from items to masks
    const maskingMappings = createMaskingMappings(
        finalItems,
        options.preferredMaskingMappings ?? [],
    );

    let privatizedPrompt = '';
    let segments: PrivatizedPromptSegment[] = [];

    try
    {
        // 3. apply masks to create the privatized prompt, depending on the chosen privatization method
        const maskedPrompt = applyMasksToItems(
            inputText,
            finalItems,
            maskingMappings,
            DEFAULT_PRIVATIZATION_METHOD,
        );

        privatizedPrompt = maskedPrompt.privatizedPrompt;
        segments = maskedPrompt.segments;
    }
    catch
    {
        return {
            privatizedPrompt: '',
            method: DEFAULT_PRIVATIZATION_METHOD,
            items: finalItems,
            maskingMappings,
            segments: [],
            safeToInject: false,
        };
    }

    return {
        privatizedPrompt,
        method: DEFAULT_PRIVATIZATION_METHOD,
        items: finalItems,
        maskingMappings,
        segments,
        safeToInject: options.safeToInject ?? false,
    };
};

const hardenPrivatizedPromptResult = (
    inputText: string,
    result: PrivatizedPromptResult,
    residualItems: SensitiveItem[],
): PrivatizedPromptResult =>
{
    if (residualItems.length === 0)
    {
        return result;
    }

    const finalItems = resolveSensitiveItemOverlaps(inputText, [
        ...result.items,
        ...residualItems,
    ]);
    const maskingMappings = createMaskingMappings(
        finalItems,
        result.maskingMappings,
    );

    try
    {
        const maskedPrompt = applyMasksToItems(
            inputText,
            finalItems,
            maskingMappings,
            result.method,
        );

        return {
            ...result,
            items: finalItems,
            maskingMappings,
            privatizedPrompt: maskedPrompt.privatizedPrompt,
            segments: maskedPrompt.segments,
        };
    }
    catch
    {
        return {
            ...result,
            safeToInject: false,
        };
    }
};

const detectResidualSensitiveItemsWithRules = (
    inputText: string,
    result: PrivatizedPromptResult,
    enabledCategories: Partial<Record<SensitiveItemCategory, boolean>> | undefined,
): SensitiveItem[] =>
{
    const residualInput = createResidualDetectionInput(result.segments);

    if (residualInput.text.trim().length === 0)
    {
        return [];
    }

    const detectedItems = [
        ...detectEmailItems(residualInput.text),
        ...detectPhoneItems(residualInput.text),
        ...detectAccountItems(residualInput.text),
        ...detectDateItems(residualInput.text),
        ...detectNetworkItems(residualInput.text),
        ...detectSecretItems(residualInput.text),
    ];

    return mapResidualSensitiveItems(
        inputText,
        result.items,
        residualInput,
        detectedItems,
        getEnabledCategorySet(RESIDUAL_RULE_CATEGORIES, enabledCategories),
    );
};

const detectResidualSensitiveItemsWithLocalModel = async (
    inputText: string,
    result: PrivatizedPromptResult,
    onProgress: LocalModelProgressCallback | undefined,
    enabledCategories: Partial<Record<SensitiveItemCategory, boolean>> | undefined,
): Promise<SensitiveItem[]> =>
{
    const residualInput = createResidualDetectionInput(result.segments);

    if (residualInput.text.trim().length === 0)
    {
        return [];
    }

    onProgress?.({
        phase: 'postprocess',
        label: 'Checking for missed values...',
    });
    await yieldToBrowser();

    const detectedItems = await detectSensitiveItemsWithLocalModel(
        residualInput.text,
        onProgress,
    );

    return mapResidualSensitiveItems(
        inputText,
        result.items,
        residualInput,
        detectedItems,
        getEnabledCategorySet(RESIDUAL_MODEL_CATEGORIES, enabledCategories),
    );
};

const reportPipelinePostprocessProgress = async (
    onProgress: LocalModelProgressCallback | undefined,
    label: string,
) =>
{
    if (onProgress == null)
    {
        return;
    }

    onProgress({
        phase: 'postprocess',
        label,
    });

    await yieldToBrowser();
};

const yieldToBrowser = () =>
{
    return new Promise<void>((resolve) =>
    {
        setTimeout(resolve, 0);
    });
};

const createResidualDetectionInput = (
    segments: PrivatizedPromptSegment[],
): ResidualDetectionInput =>
{
    const parts: ResidualDetectionPart[] = [];
    let text = '';

    for (const segment of segments)
    {
        if (segment.type !== 'text' || segment.text.length === 0)
        {
            continue;
        }

        if (text.length > 0)
        {
            text += '\n';
        }

        const start = text.length;
        text += segment.text;
        parts.push({
            start,
            end: text.length,
            sourceStart: segment.sourceStart,
        });
    }

    return {
        text,
        parts,
        protectedRanges: findProtectedPlaceholderRanges(text),
    };
};

const findProtectedPlaceholderRanges = (inputText: string): TextRange[] =>
{
    return [...inputText.matchAll(RESIDUAL_PLACEHOLDER_PATTERN)].map((match) =>
    {
        return {
            start: match.index,
            end: match.index + match[0].length,
        };
    });
};

const filterProtectedPlaceholderItems = (
    inputText: string,
    items: SensitiveItem[],
) =>
{
    const protectedRanges = findProtectedPlaceholderRanges(inputText);

    if (protectedRanges.length === 0)
    {
        return items;
    }

    return items.filter((item) =>
    {
        return !overlapsAnyRange(item, protectedRanges);
    });
};

const filterInvalidModelDateItems = (inputText: string, items: SensitiveItem[]) =>
{
    return items.filter((item) =>
    {
        return !isInvalidModelDateItem(inputText, item);
    });
};

const isInvalidModelDateItem = (inputText: string, item: SensitiveItem) =>
{
    return (
        item.source === 'model' &&
        item.category === 'DATE' &&
        isClearlyInvalidDateItem(inputText, item)
    );
};

const mapResidualSensitiveItems = (
    inputText: string,
    existingItems: SensitiveItem[],
    residualInput: ResidualDetectionInput,
    detectedItems: SensitiveItem[],
    categories: ReadonlySet<SensitiveItemCategory>,
): SensitiveItem[] =>
{
    const residualItems: SensitiveItem[] = [];
    let nextItemIndex = getNextResidualSensitiveItemIndex(existingItems);

    for (const item of detectedItems)
    {
        if (
            !categories.has(item.category) ||
            overlapsAnyRange(item, residualInput.protectedRanges)
        )
        {
            continue;
        }

        const mappedItem = mapResidualSensitiveItem(
            inputText,
            residualInput,
            item,
            nextItemIndex,
        );

        if (mappedItem == null)
        {
            continue;
        }

        residualItems.push(mappedItem);
        nextItemIndex += 1;
    }

    return residualItems;
};

const mapResidualSensitiveItem = (
    inputText: string,
    residualInput: ResidualDetectionInput,
    item: SensitiveItem,
    itemIndex: number,
): SensitiveItem | null =>
{
    const part = residualInput.parts.find((residualPart) =>
    {
        return item.start >= residualPart.start && item.end <= residualPart.end;
    });

    if (part == null)
    {
        return null;
    }

    const start = part.sourceStart + item.start - part.start;
    const end = part.sourceStart + item.end - part.start;
    const value = inputText.slice(start, end);

    if (value !== item.value || RESIDUAL_PLACEHOLDER_VALUE_PATTERN.test(value))
    {
        return null;
    }

    return {
        ...item,
        id: createNumberedId('residual-sensitive-item', itemIndex),
        start,
        end,
        value,
    };
};

const getNextResidualSensitiveItemIndex = (items: SensitiveItem[]) =>
{
    return items.reduce((maximumIndex, item) =>
    {
        const match = /^residual-sensitive-item-(\d+)$/.exec(item.id);

        if (match == null)
        {
            return maximumIndex;
        }

        return Math.max(maximumIndex, Number(match[1]));
    }, 0) + 1;
};

const detectSensitiveItemsSync = (
    inputText: string,
    options: PrivatizationPipelineOptions,
): SensitiveItem[] =>
{
    const detectedItems: SensitiveItem[] = [];
    const useRulesDetection = options.useRulesDetection ?? USE_RULES_DETECTION;

    if (useRulesDetection)
    {
        detectedItems.push(...detectSensitiveItemsWithRules(inputText));
    }

    return filterSensitiveItemsByEnabledCategories(
        filterInvalidModelDateItems(
            inputText,
            filterProtectedPlaceholderItems(inputText, detectedItems),
        ),
        options.enabledCategories,
    );
};

const resolveSensitiveItemOverlaps = (
    inputText: string,
    items: SensitiveItem[],
): SensitiveItem[] =>
{
    // invalid detector output is left untouched so masking fails closed later
    if (items.some((item) => !isValidItemRange(inputText, item)))
    {
        return [...items].sort(compareItemsByPosition);
    }

    const manualProtectedItems = protectManualItems(inputText, items);
    const protectedItems = protectAuthoritativeRuleItems(
        inputText,
        manualProtectedItems,
    );

    return groupOverlappingItems(protectedItems)
        .map((group, index) => resolveOverlapGroup(inputText, group, index + 1))
        .sort(compareItemsByPosition);
};

const protectManualItems = (
    inputText: string,
    items: SensitiveItem[],
): SensitiveItem[] =>
{
    const manualItems = items.filter((item) =>
    {
        return item.source === 'manual';
    });

    if (manualItems.length === 0)
    {
        return items;
    }

    const protectedItems: SensitiveItem[] = [];

    for (const item of items)
    {
        if (item.source === 'manual')
        {
            protectedItems.push(item);
            continue;
        }

        const overlappingManualItems = manualItems.filter((manualItem) =>
        {
            return sensitiveItemsOverlap(item, manualItem);
        });

        if (overlappingManualItems.length === 0)
        {
            protectedItems.push(item);
            continue;
        }

        protectedItems.push(
            ...splitSensitiveItemAroundBlockingItems(
                inputText,
                item,
                overlappingManualItems,
            ),
        );
    }

    return protectedItems;
};

const protectAuthoritativeRuleItems = (
    inputText: string,
    items: SensitiveItem[],
): SensitiveItem[] =>
{
    const authoritativeRuleItems = items.filter(isAuthoritativeRuleItem);
    const protectedItems: SensitiveItem[] = [];

    for (const item of items)
    {
        if (item.source !== 'model')
        {
            protectedItems.push(item);
            continue;
        }

        const overlappingRuleItems = authoritativeRuleItems.filter((ruleItem) =>
        {
            return sensitiveItemsOverlap(item, ruleItem);
        });

        if (overlappingRuleItems.length === 0)
        {
            protectedItems.push(item);
            continue;
        }

        protectedItems.push(
            ...splitSensitiveItemAroundBlockingItems(
                inputText,
                item,
                overlappingRuleItems,
            ),
        );
    }

    return protectedItems;
};

const splitSensitiveItemAroundBlockingItems = (
    inputText: string,
    item: SensitiveItem,
    blockingItems: SensitiveItem[],
): SensitiveItem[] =>
{
    const fragments: SensitiveItem[] = [];
    let cursor = item.start;
    let fragmentIndex = 1;

    for (const blockingItem of [...blockingItems].sort(compareItemsByPosition))
    {
        if (blockingItem.start > cursor)
        {
            const fragment = createSensitiveItemFragment(
                inputText,
                item,
                cursor,
                Math.min(blockingItem.start, item.end),
                fragmentIndex,
            );

            if (fragment != null)
            {
                fragments.push(fragment);
                fragmentIndex += 1;
            }
        }

        cursor = Math.max(cursor, blockingItem.end);
    }

    if (cursor < item.end)
    {
        const fragment = createSensitiveItemFragment(
            inputText,
            item,
            cursor,
            item.end,
            fragmentIndex,
        );

        if (fragment != null)
        {
            fragments.push(fragment);
        }
    }

    return fragments;
};

const createSensitiveItemFragment = (
    inputText: string,
    item: SensitiveItem,
    start: number,
    end: number,
    fragmentIndex: number,
): SensitiveItem | null =>
{
    const range = trimFragmentRange(inputText, start, end);
    const value = inputText.slice(range.start, range.end);

    if (value.length === 0 || !/[\p{L}\p{N}]/u.test(value))
    {
        return null;
    }

    return {
        ...item,
        id: `${item.id}-fragment-${String(fragmentIndex).padStart(3, '0')}`,
        start: range.start,
        end: range.end,
        value,
    };
};

const trimFragmentRange = (
    inputText: string,
    start: number,
    end: number,
) =>
{
    let trimmedStart = start;
    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && /[\s"'`<([{]/.test(inputText[trimmedStart]))
    {
        trimmedStart += 1;
    }

    while (
        trimmedEnd > trimmedStart &&
        /[\s"'`>.,;:!?)}\]]/.test(inputText[trimmedEnd - 1])
    )
    {
        trimmedEnd -= 1;
    }

    return {
        start: trimmedStart,
        end: trimmedEnd,
    };
};

const createManualSensitiveItem = (
    inputText: string,
    items: SensitiveItem[],
    manualItemInput: ManualSensitiveItemInput,
): SensitiveItem =>
{
    if (
        !Number.isInteger(manualItemInput.start) ||
        !Number.isInteger(manualItemInput.end) ||
        manualItemInput.start < 0 ||
        manualItemInput.end > inputText.length ||
        manualItemInput.end <= manualItemInput.start
    )
    {
        throw new Error('Manual sensitive item range is invalid.');
    }

    const range = trimFragmentRange(
        inputText,
        manualItemInput.start,
        manualItemInput.end,
    );
    const value = inputText.slice(range.start, range.end);

    if (value.trim().length === 0)
    {
        throw new Error('Manual sensitive item range is empty.');
    }

    return {
        id: createNumberedId(
            'manual-sensitive-item',
            getNextManualSensitiveItemIndex(items),
        ),
        category: manualItemInput.category,
        start: range.start,
        end: range.end,
        value,
        confidence: 1,
        source: 'manual',
    };
};

const getNextManualSensitiveItemIndex = (items: SensitiveItem[]) =>
{
    return items.reduce((maximumIndex, item) =>
    {
        if (item.source !== 'manual')
        {
            return maximumIndex;
        }

        const match = /^manual-sensitive-item-(\d+)/.exec(item.id);

        if (match == null)
        {
            return maximumIndex;
        }

        return Math.max(maximumIndex, Number(match[1]));
    }, 0) + 1;
};

const isAuthoritativeRuleItem = (item: SensitiveItem) =>
{
    return item.source === 'rules' && AUTHORITATIVE_RULE_CATEGORIES.has(item.category);
};

const sensitiveItemsOverlap = (left: SensitiveItem, right: SensitiveItem) =>
{
    return left.start < right.end && right.start < left.end;
};

const overlapsAnyRange = (
    range: Pick<TextRange, 'start' | 'end'>,
    ranges: TextRange[],
) =>
{
    return ranges.some((existingRange) =>
    {
        return range.start < existingRange.end && existingRange.start < range.end;
    });
};

const groupOverlappingItems = (items: SensitiveItem[]): SensitiveItem[][] =>
{
    const sortedItems = [...items].sort(compareItemsByPosition);
    const groups: SensitiveItem[][] = [];
    let currentGroup: SensitiveItem[] = [];
    let currentGroupEnd = 0;

    for (const item of sortedItems)
    {
        if (currentGroup.length === 0)
        {
            currentGroup = [item];
            currentGroupEnd = item.end;
            continue;
        }

        // connected overlaps are resolved as one group
        if (item.start < currentGroupEnd)
        {
            currentGroup.push(item);
            currentGroupEnd = Math.max(currentGroupEnd, item.end);
            continue;
        }

        groups.push(currentGroup);
        currentGroup = [item];
        currentGroupEnd = item.end;
    }

    if (currentGroup.length > 0)
    {
        groups.push(currentGroup);
    }

    return groups;
};

const resolveOverlapGroup = (
    inputText: string,
    group: SensitiveItem[],
    groupIndex: number,
): SensitiveItem =>
{
    if (group.length === 1)
    {
        return group[0];
    }

    const groupRange = getOverlapGroupRange(group);
    const containingItems = group.filter((item) =>
    {
        return item.start <= groupRange.start && item.end >= groupRange.end;
    });

    if (containingItems.length > 0)
    {
        return chooseOverlapRepresentative(containingItems);
    }

    return createMergedSensitiveItem(inputText, group, groupRange, groupIndex);
};

const getOverlapGroupRange = (group: SensitiveItem[]) =>
{
    return {
        start: Math.min(...group.map((item) => item.start)),
        end: Math.max(...group.map((item) => item.end)),
    };
};

const createMergedSensitiveItem = (
    inputText: string,
    group: SensitiveItem[],
    groupRange: Pick<SensitiveItem, 'start' | 'end'>,
    groupIndex: number,
): SensitiveItem =>
{
    const representative = chooseOverlapRepresentative(group);

    return {
        id: createNumberedId('resolved-sensitive-item', groupIndex),
        category: representative.category,
        start: groupRange.start,
        end: groupRange.end,
        value: inputText.slice(groupRange.start, groupRange.end),
        // merged overlap confidence should not exceed the weakest involved item
        confidence: Math.min(...group.map((item) => item.confidence)),
        source: representative.source,
    };
};

const chooseOverlapRepresentative = (items: SensitiveItem[]): SensitiveItem =>
{
    return [...items].sort(compareOverlapRepresentatives)[0];
};

const compareOverlapRepresentatives = (left: SensitiveItem, right: SensitiveItem) =>
{
    const manualDifference = getManualSourcePriority(left) - getManualSourcePriority(right);

    if (manualDifference !== 0)
    {
        return manualDifference;
    }

    const ruleDatePhoneDifference = compareRuleDatePhoneOverlapPriority(left, right);

    if (ruleDatePhoneDifference !== 0)
    {
        return ruleDatePhoneDifference;
    }

    const categoryDifference =
        getSensitiveItemCategoryPriority(left.category) -
        getSensitiveItemCategoryPriority(right.category);

    if (categoryDifference !== 0)
    {
        return categoryDifference;
    }

    const confidenceDifference = right.confidence - left.confidence;

    if (confidenceDifference !== 0)
    {
        return confidenceDifference;
    }

    return compareItemsByPosition(left, right);
};

const compareRuleDatePhoneOverlapPriority = (
    left: SensitiveItem,
    right: SensitiveItem,
) =>
{
    if (isRuleDateItem(left) && right.category === 'PHONE')
    {
        return -1;
    }

    if (left.category === 'PHONE' && isRuleDateItem(right))
    {
        return 1;
    }

    return 0;
};

const isRuleDateItem = (item: SensitiveItem) =>
{
    return item.source === 'rules' && item.category === 'DATE';
};

const getManualSourcePriority = (item: SensitiveItem) =>
{
    return item.source === 'manual' ? 0 : 1;
};

const getSensitiveItemCategoryPriority = (category: SensitiveItemCategory) =>
{
    const index = SENSITIVE_ITEM_CATEGORY_PRIORITY.indexOf(category);

    if (index === -1)
    {
        return SENSITIVE_ITEM_CATEGORY_PRIORITY.length;
    }

    return index;
};

const createNumberedId = (prefix: string, index: number) =>
{
    return `${prefix}-${String(index).padStart(3, '0')}`;
};

const createMask = (category: SensitiveItemCategory, categoryIndex: number) =>
{
    return `${category}_${String(categoryIndex).padStart(3, '0')}`;
};

// TODO: add normalization so that "timo" and "Timo" get the same mask?
const createMaskingMappings = (
    items: SensitiveItem[],
    preferredMaskingMappings: readonly MaskingMapping[] = [],
): MaskingMapping[] =>
{
    const maskingMappings: MaskingMapping[] = [];
    const categoryCounts = getInitialCategoryCounts(preferredMaskingMappings);
    const mappingsByCategory = new Map<SensitiveItemCategory, Map<string, MaskingMapping>>();

    for (const item of items)
    {
        // group exact original values within each category
        let mappingsByOriginal = mappingsByCategory.get(item.category);

        if (mappingsByOriginal == null)
        {
            mappingsByOriginal = new Map<string, MaskingMapping>();
            mappingsByCategory.set(item.category, mappingsByOriginal);
        }

        const existingMapping = mappingsByOriginal.get(item.value);

        // repeated values share the first mask they received
        if (existingMapping != null)
        {
            existingMapping.itemIds.push(item.id);
            continue;
        }

        const preferredMapping = findPreferredMaskingMapping(
            preferredMaskingMappings,
            item,
        );

        if (
            preferredMapping != null &&
            !isMaskAlreadyUsed(maskingMappings, preferredMapping)
        )
        {
            const maskingMapping = {
                id: createNumberedId('masking-mapping', maskingMappings.length + 1),
                category: item.category,
                original: item.value,
                mask: preferredMapping.mask,
                itemIds: [item.id],
            };

            mappingsByOriginal.set(item.value, maskingMapping);
            maskingMappings.push(maskingMapping);
            continue;
        }

        // first-seen values get the next mask number for their category
        const categoryIndex = (categoryCounts.get(item.category) ?? 0) + 1;
        categoryCounts.set(item.category, categoryIndex);

        const maskingMapping = {
            id: createNumberedId('masking-mapping', maskingMappings.length + 1),
            category: item.category,
            original: item.value,
            mask: createMask(item.category, categoryIndex),
            itemIds: [item.id],
        };

        mappingsByOriginal.set(item.value, maskingMapping);
        maskingMappings.push(maskingMapping);
    }

    return maskingMappings;
};

const getInitialCategoryCounts = (
    preferredMaskingMappings: readonly MaskingMapping[],
) =>
{
    const categoryCounts = new Map<SensitiveItemCategory, number>();

    for (const maskingMapping of preferredMaskingMappings)
    {
        const maskIndex = getMaskCategoryIndex(
            maskingMapping.category,
            maskingMapping.mask,
        );

        if (maskIndex == null)
        {
            continue;
        }

        categoryCounts.set(
            maskingMapping.category,
            Math.max(categoryCounts.get(maskingMapping.category) ?? 0, maskIndex),
        );
    }

    return categoryCounts;
};

const findPreferredMaskingMapping = (
    preferredMaskingMappings: readonly MaskingMapping[],
    item: SensitiveItem,
) =>
{
    return preferredMaskingMappings.find((maskingMapping) =>
    {
        return (
            maskingMapping.category === item.category &&
            maskingMapping.original === item.value
        );
    });
};

const isMaskAlreadyUsed = (
    maskingMappings: MaskingMapping[],
    preferredMapping: MaskingMapping,
) =>
{
    return maskingMappings.some((maskingMapping) =>
    {
        return (
            maskingMapping.category === preferredMapping.category &&
            maskingMapping.mask === preferredMapping.mask &&
            maskingMapping.original !== preferredMapping.original
        );
    });
};

const getMaskCategoryIndex = (
    category: SensitiveItemCategory,
    mask: string,
) =>
{
    const match = new RegExp(`^${category}_(\\d+)$`).exec(mask);

    if (match == null)
    {
        return null;
    }

    return Number(match[1]);
};

const compareItemsByPosition = (left: SensitiveItem, right: SensitiveItem) =>
{
    return left.start - right.start || right.end - left.end;
};

const isValidItemRange = (inputText: string, item: SensitiveItem) =>
{
    return (
        Number.isInteger(item.start) &&
        Number.isInteger(item.end) &&
        item.start >= 0 &&
        item.end <= inputText.length &&
        item.end > item.start &&
        inputText.slice(item.start, item.end) === item.value
    );
};

const createMaskingMappingByItemId = (
    maskingMappings: MaskingMapping[],
) =>
{
    const mappingByItemId = new Map<string, MaskingMapping>();

    for (const maskingMapping of maskingMappings)
    {
        for (const itemId of maskingMapping.itemIds)
        {
            if (mappingByItemId.has(itemId))
            {
                throw new Error('Sensitive item has multiple masking mappings.');
            }

            mappingByItemId.set(itemId, maskingMapping);
        }
    }

    return mappingByItemId;
};

const getMaskForMethod = (
    maskingMapping: MaskingMapping,
    method: PrivatizationMethod,
) =>
{
    if (method === 'placeholder')
    {
        return maskingMapping.mask;
    }

    if (method === 'removal')
    {
        return '';
    }

    throw new Error('Pseudonymized masking is not implemented yet.');
};

const applyMasksToItems = (
    inputText: string,
    items: SensitiveItem[],
    maskingMappings: MaskingMapping[],
    method: PrivatizationMethod,
    ignoredMappingIds: ReadonlySet<string> = new Set(),
): PrivatizedPromptPreview =>
{
    const mappingByItemId = createMaskingMappingByItemId(maskingMappings);
    const sortedItems = [...items].sort(compareItemsByPosition);
    const segments: PrivatizedPromptSegment[] = [];
    let cursor = 0;

    for (const item of sortedItems)
    {
        if (!isValidItemRange(inputText, item))
        {
            throw new Error('Sensitive item range is invalid.');
        }

        if (item.start < cursor)
        {
            throw new Error('Sensitive item ranges overlap.');
        }

        const maskingMapping = mappingByItemId.get(item.id);

        if (maskingMapping == null)
        {
            throw new Error('Sensitive item has no mask.');
        }

        if (ignoredMappingIds.has(maskingMapping.id))
        {
            appendTextSegment(segments, inputText.slice(cursor, item.end), cursor, item.end);
            cursor = item.end;
            continue;
        }

        appendTextSegment(
            segments,
            inputText.slice(cursor, item.start),
            cursor,
            item.start,
        );
        appendMaskSegment(
            segments,
            getMaskForMethod(maskingMapping, method),
            maskingMapping,
            item,
        );
        cursor = item.end;
    }

    appendTextSegment(segments, inputText.slice(cursor), cursor, inputText.length);

    return {
        privatizedPrompt: segments.map((segment) => segment.text).join(''),
        segments,
    };
};

const appendTextSegment = (
    segments: PrivatizedPromptSegment[],
    text: string,
    sourceStart: number,
    sourceEnd: number,
) =>
{
    if (text.length === 0)
    {
        return;
    }

    const previousSegment = segments.at(-1);

    if (previousSegment?.type === 'text' && previousSegment.sourceEnd === sourceStart)
    {
        previousSegment.text += text;
        previousSegment.sourceEnd = sourceEnd;
        return;
    }

    segments.push({
        type: 'text',
        text,
        sourceStart,
        sourceEnd,
    });
};

const appendMaskSegment = (
    segments: PrivatizedPromptSegment[],
    text: string,
    maskingMapping: MaskingMapping,
    item: SensitiveItem,
) =>
{
    if (text.length === 0)
    {
        return;
    }

    segments.push({
        type: 'mask',
        text,
        category: maskingMapping.category,
        original: maskingMapping.original,
        mappingId: maskingMapping.id,
        sourceStart: item.start,
        sourceEnd: item.end,
    });
};
