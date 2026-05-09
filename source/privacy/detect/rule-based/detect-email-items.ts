import { find } from 'linkifyjs';
import type { SensitiveItem } from '../../types';

const EMAIL_DETECTION_CONFIDENCE = 0.95;

// using 'linkifyjs' for email detection
export const detectEmailItems = (inputText: string): SensitiveItem[] =>
{
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
