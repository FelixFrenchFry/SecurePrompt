import { createRuleDetector, type RuleMatch } from './rule';

// coordinate pairs in decimal degrees with 3+ decimals ("22.1551, -80.4359"), not number lists
const COORDINATES =
    /(?<![\p{L}\p{N}_.-]|\d\s?,\s?)(-?\d{1,2}\.\d{3,})\s?,\s?(-?\d{1,3}\.\d{3,})(?![\p{L}\p{N}_]|\.\d|\s?,\s?-?\d)/gu;

export const findCoordinates = (text: string): RuleMatch[] =>
{
    const matches: RuleMatch[] = [];

    for (const match of text.matchAll(COORDINATES))
    {
        const latitude = Math.abs(Number(match[1]));
        const longitude = Math.abs(Number(match[2]));

        if (latitude <= 90 && longitude <= 180)
        {
            matches.push({ start: match.index, end: match.index + match[0].length, category: 'ADDRESS', validated: true });
        }
    }

    return matches;
};

export const locationRule = createRuleDetector('location', findCoordinates);
