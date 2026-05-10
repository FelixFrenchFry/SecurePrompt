import {
    DEFAULT_PRIVATIZATION_METHOD,
    USE_LOCAL_MODEL_DETECTION,
    USE_RULES_DETECTION,
} from './config';
import { detectSensitiveItemsWithLocalModel } from './detect/local-model-based/detection-local-model-based';
import { detectSensitiveItemsWithRules } from './detect/rule-based/detection-rule-based';
import type {
    MaskingMapping,
    PrivatizationMethod,
    PrivatizedPromptResult,
    SensitiveItem,
    SensitiveItemCategory,
} from './types';

export type {
    DetectionSource,
    MaskingMapping,
    PrivatizationMethod,
    PrivatizedPromptResult,
    SensitiveItem,
    SensitiveItemCategory,
} from './types';

export { DEFAULT_PRIVATIZATION_METHOD } from './config';

export type PrivatizationPipelineOptions = {
    useLocalModelDetection?: boolean;
    useRulesDetection?: boolean;
};

const PRIVATIZATION_PIPELINE_IMPLEMENTED = false;

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

// sync (rules-only) pipeline
export const createPrivatizedPrompt = (inputText: string): PrivatizedPromptResult =>
{
    const detectedItems = detectSensitiveItemsSync(inputText, {});

    return createPrivatizedPromptFromItems(inputText, detectedItems);
};

// async pipeline for detection with local model
export const createPrivatizedPromptAsync = async (
    inputText: string,
    options: PrivatizationPipelineOptions = {},
): Promise<PrivatizedPromptResult> =>
{
    const detectedItems = await detectSensitiveItemsAsync(inputText, options);

    return createPrivatizedPromptFromItems(inputText, detectedItems);
};

const createPrivatizedPromptFromItems = (
    inputText: string,
    detectedItems: SensitiveItem[],
): PrivatizedPromptResult =>
{
    // 1. resolve overlaps and conflicts between detected items
    const finalItems = resolveSensitiveItemOverlaps(inputText, detectedItems);

    // 2. create many-to-one masking mappings from items to masks
    const maskingMappings = createMaskingMappings(finalItems);

    let privatizedPrompt = '';

    try
    {
        // 3. apply masks to create the privatized prompt, depending on the chosen privatization method
        privatizedPrompt = applyMasksToItems(
            inputText,
            finalItems,
            maskingMappings,
            DEFAULT_PRIVATIZATION_METHOD,
        );
    }
    catch
    {
        return {
            privatizedPrompt: '',
            method: DEFAULT_PRIVATIZATION_METHOD,
            items: finalItems,
            maskingMappings,
            safeToInject: false,
        };
    }

    return {
        privatizedPrompt,
        method: DEFAULT_PRIVATIZATION_METHOD,
        items: finalItems,
        maskingMappings,
        safeToInject: PRIVATIZATION_PIPELINE_IMPLEMENTED,
    };
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

    return detectedItems;
};

const detectSensitiveItemsAsync = async (
    inputText: string,
    options: PrivatizationPipelineOptions,
): Promise<SensitiveItem[]> =>
{
    const detectedItems = detectSensitiveItemsSync(inputText, options);
    const useLocalModelDetection =
        options.useLocalModelDetection ?? USE_LOCAL_MODEL_DETECTION;

    if (useLocalModelDetection)
    {
        detectedItems.push(...(await detectSensitiveItemsWithLocalModel(inputText)));
    }

    return detectedItems;
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

    return groupOverlappingItems(items)
        .map((group, index) => resolveOverlapGroup(inputText, group, index + 1))
        .sort(compareItemsByPosition);
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
const createMaskingMappings = (items: SensitiveItem[]): MaskingMapping[] =>
{
    const maskingMappings: MaskingMapping[] = [];
    const categoryCounts = new Map<SensitiveItemCategory, number>();
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

const createMaskByItemId = (
    maskingMappings: MaskingMapping[],
    method: PrivatizationMethod,
) =>
{
    const maskByItemId = new Map<string, string>();

    for (const maskingMapping of maskingMappings)
    {
        const mask = getMaskForMethod(maskingMapping, method);

        for (const itemId of maskingMapping.itemIds)
        {
            if (maskByItemId.has(itemId))
            {
                throw new Error('Sensitive item has multiple masks.');
            }

            maskByItemId.set(itemId, mask);
        }
    }

    return maskByItemId;
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
) =>
{
    const maskByItemId = createMaskByItemId(maskingMappings, method);
    const sortedItems = [...items].sort(compareItemsByPosition);
    const outputParts: string[] = [];
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

        const mask = maskByItemId.get(item.id);

        if (mask == null)
        {
            throw new Error('Sensitive item has no mask.');
        }

        outputParts.push(inputText.slice(cursor, item.start), mask);
        cursor = item.end;
    }

    outputParts.push(inputText.slice(cursor));

    return outputParts.join('');
};
