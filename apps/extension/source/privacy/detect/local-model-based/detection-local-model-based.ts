import type {
    LocalModelProgressCallback,
    SensitiveItem,
} from '../../types';
import { detectPrivacyFilterItems } from './detect-privacy-filter-items';

export const detectSensitiveItemsWithLocalModel = async (
    inputText: string,
    onProgress?: LocalModelProgressCallback,
): Promise<SensitiveItem[]> =>
{
    const detectedItems: SensitiveItem[] = [];

    detectedItems.push(...(await detectPrivacyFilterItems(inputText, onProgress)));

    return detectedItems;
};
