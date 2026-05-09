import {
    DEFAULT_PRIVATIZATION_METHOD,
    USE_LOCAL_MODEL_DETECTION,
    USE_RULES_DETECTION,
} from './config';
import { detectSensitiveItemsWithLocalModel } from './detect/detection-local-model';
import { detectSensitiveItemsWithRules } from './detect/detection-rules';
import type {
    PrivatizedPromptResult,
    ReplacementMapping,
    SensitiveItem,
} from './types';

export type {
    DetectionSource,
    PrivatizationMethod,
    PrivatizedPromptResult,
    ReplacementMapping,
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

    // 3. create many-to-one mapping from items to replacement values
    const mappings = createReplacementMappings(finalItems);

    // 4. apply the replacement values to the items to create the privatized prompt
    const privatizedPrompt = applyReplacementsToItems(inputText, finalItems, mappings);

    return {
        privatizedPrompt,
        method: DEFAULT_PRIVATIZATION_METHOD,
        items: finalItems,
        mappings,
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

const createReplacementMappings = (_items: SensitiveItem[]): ReplacementMapping[] =>
{
    return [];
};

const applyReplacementsToItems = (
    inputText: string,
    _items: SensitiveItem[],
    _mappings: ReplacementMapping[],
) =>
{
    return inputText;
};
