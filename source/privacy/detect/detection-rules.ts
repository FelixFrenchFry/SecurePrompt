import { find } from 'linkifyjs';
import type { SensitiveItem } from '../types';

const EMAIL_DETECTION_CONFIDENCE = 0.95;

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

const detectEmailItems = (inputText: string): SensitiveItem[] =>
{
    // using 'linkifyjs' for email detection
    return find(inputText, 'email')
        .filter((match) => match.type === 'email')
        .map((match, index) => ({
            id: `email-${String(index + 1).padStart(3, '0')}`,
            category: 'EMAIL',
            start: match.start,
            end: match.end,
            value: match.value,
            confidence: EMAIL_DETECTION_CONFIDENCE,
            source: 'rules',
        }));
};

const detectPhoneItems = (_inputText: string): SensitiveItem[] =>
{
    return [];
};

const detectPersonItems = (_inputText: string): SensitiveItem[] =>
{
    // TODO: implement?
    // regex-only person detection is too unreliable across text
    return [];
};

const detectAddressItems = (_inputText: string): SensitiveItem[] =>
{
    // TODO: implement?
    // address detection needs stricter rules or a parser before it is safe to enable
    return [];
};

const detectAccountItems = (_inputText: string): SensitiveItem[] =>
{
    return [];
};

const detectDateItems = (_inputText: string): SensitiveItem[] =>
{
    return [];
};

const detectNetworkItems = (_inputText: string): SensitiveItem[] =>
{
    return [];
};

const detectSecretItems = (_inputText: string): SensitiveItem[] =>
{
    return [];
};
