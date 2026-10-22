import { compareSpans, overlaps } from '../../spans';
import type { Category, Detection, Detector, Span } from '../../types';

// a rule finds values with a formal definition (calendar date, IP address, IBAN, token format)
// validated means a check beyond the pattern passed (calendar day, octets, mod-97, Luhn)
export type RuleMatch = Span & {
    category: Category;
    validated: boolean;
};

export const createRuleDetector = (name: string, find: (text: string) => RuleMatch[]): Detector =>
{
    const id = `rule:${name}`;

    return {
        id,
        detect: async (text) =>
        {
            return find(text).map((match): Detection =>
            {
                return { ...match, source: 'rule', detector: id, score: 1 };
            });
        },
    };
};

// keeps the longest of overlapping matches, so "Freitag, 14. März 2025" wins over "14. März"
export const keepLongest = (matches: readonly RuleMatch[]): RuleMatch[] =>
{
    const kept: RuleMatch[] = [];
    const byLength = [...matches].sort((left, right) => right.end - right.start - (left.end - left.start) || left.start - right.start);

    for (const match of byLength)
    {
        if (!kept.some((other) => overlaps(other, match)))
        {
            kept.push(match);
        }
    }

    return kept.sort(compareSpans);
};
