import type { SensitiveItem } from '../../types';
import { detectPrivacyFilterItems } from './detect-privacy-filter-items';

export const detectSensitiveItemsWithLocalModel = async (
    inputText: string,
): Promise<SensitiveItem[]> =>
{
    const detectedItems: SensitiveItem[] = [];

    detectedItems.push(...(await detectPrivacyFilterItems(inputText)));

    return detectedItems;
};
