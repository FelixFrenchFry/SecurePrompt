import {
    DEFAULT_PRIVATIZATION_METHOD,
    USE_LOCAL_MODEL_DETECTION,
    USE_RULES_DETECTION,
} from './config';
import { detectSensitiveItemsWithLocalModel } from './detect/detection-local-model';
import { detectSensitiveItemsWithRules } from './detect/detection-rules';
import type {
    MaskingMapping,
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

    // 4. apply masks to create the privatized prompt, depending on the chosen privatization method
    const privatizedPrompt = applyMasksToItems(inputText, finalItems, maskingMappings);

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

        // make  repeated values share the first mask they received
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

const applyMasksToItems = (
    inputText: string,
    _items: SensitiveItem[],
    _maskingMappings: MaskingMapping[],
) =>
{
    return inputText;
};
