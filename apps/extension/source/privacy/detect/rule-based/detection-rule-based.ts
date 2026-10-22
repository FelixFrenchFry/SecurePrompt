import type { SensitiveItem } from '../../types';
import { detectAccountItems } from './detect-account-items';
import { detectAddressItems } from './detect-address-items';
import { detectDateItems } from './detect-date-items';
import { detectEmailItems } from './detect-email-items';
import { detectNetworkItems } from './detect-network-items';
import { detectPersonItems } from './detect-person-items';
import { detectPhoneItems } from './detect-phone-items';
import { detectSecretItems } from './detect-secret-items';

export const detectSensitiveItemsWithRules = (inputText: string): SensitiveItem[] =>
{
    const detectedItems: SensitiveItem[] = [];

    detectedItems.push(...detectEmailItems(inputText));
    detectedItems.push(...detectPhoneItems(inputText));
    detectedItems.push(...detectPersonItems(inputText));
    detectedItems.push(...detectAddressItems(inputText));
    detectedItems.push(...detectAccountItems(inputText));
    detectedItems.push(...detectDateItems(inputText));
    detectedItems.push(...detectNetworkItems(inputText));
    detectedItems.push(...detectSecretItems(inputText));

    return detectedItems;
};
