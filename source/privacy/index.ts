import {
    DEFAULT_PRIVATIZATION_METHOD,
    USE_LOCAL_MODEL_DETECTION,
    USE_RULES_DETECTION,
} from './config';
import { detectSensitiveItemsWithLocalModel } from './detect/detection-local-model';
import { detectSensitiveItemsWithRules } from './detect/detection-rules';
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

const PRIVATIZATION_PIPELINE_IMPLEMENTED = false;

// main privatization pipeline
export const createPrivatizedPrompt = (inputText: string): PrivatizedPromptResult =>
{
    // 1. detect sensitive items in the input text
    const detectedItems = detectSensitiveItems(inputText);

    // 2. resolve overlaps and conflicts between detected items
    const finalItems = resolveSensitiveItemOverlaps(detectedItems);

    // 3. create many-to-one masking mappings from items to masks
    const maskingMappings = createMaskingMappings(finalItems);

    let privatizedPrompt = '';

    try
    {
        // 4. apply masks to create the privatized prompt, depending on the chosen privatization method
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

const detectSensitiveItems = (inputText: string): SensitiveItem[] =>
{
    const detectedItems: SensitiveItem[] = [];

    if (USE_RULES_DETECTION) {
        detectedItems.push(...detectSensitiveItemsWithRules(inputText));
    }

    if (USE_LOCAL_MODEL_DETECTION) {
        detectedItems.push(...detectSensitiveItemsWithLocalModel(inputText));
    }

    return detectedItems;
};

const resolveSensitiveItemOverlaps = (items: SensitiveItem[]): SensitiveItem[] =>
{
    return items;
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
