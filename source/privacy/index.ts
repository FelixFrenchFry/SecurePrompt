import type { PseudonymizationResult, SensitiveItem, SensitiveItemCategory } from './types';

export type {
    DetectionSource,
    PlaceholderMapping,
    PseudonymizationResult,
    SensitiveItem,
    SensitiveItemCategory,
} from './types';

const RULES: Array<{ category: SensitiveItemCategory; pattern: RegExp }> = [
    { category: 'EMAIL', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { category: 'PHONE', pattern: /\b(?:\+?\d[\d\s().-]{6,}\d)\b/g },
    { category: 'ACCOUNT', pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/gi },
    { category: 'URL', pattern: /\bhttps?:\/\/[^\s<>"']+/gi },
    { category: 'SECRET', pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,})\b/g },
];

export const detectByRules = (text: string): SensitiveItem[] => {
    const items: SensitiveItem[] = [];

    for (const rule of RULES) {
        rule.pattern.lastIndex = 0;

        for (let match = rule.pattern.exec(text); match != null; match = rule.pattern.exec(text)) {
            items.push({
                id: `item-${items.length + 1}`,
                category: rule.category,
                start: match.index,
                end: match.index + match[0].length,
                value: match[0],
                confidence: 1,
                source: 'rules',
            });
        }
    }

    return items.sort((left, right) => left.start - right.start);
};

const placeholderFor = (item: SensitiveItem, index: number) => {
    return `[${item.category}_${index}]`;
};

export const pseudonymize = (text: string, items: SensitiveItem[]): PseudonymizationResult => {
    let cursor = 0;
    let pseudonymizedText = '';

    const mappings = items.map((item, index) => {
        const placeholder = placeholderFor(item, index + 1);
        pseudonymizedText += text.slice(cursor, item.start) + placeholder;
        cursor = item.end;

        return {
            id: `mapping-${index + 1}`,
            category: item.category,
            original: item.value,
            placeholder,
            itemIds: [item.id],
        };
    });

    pseudonymizedText += text.slice(cursor);

    return {
        pseudonymizedText,
        items,
        mappings,
        safeToInject: true,
    };
};
