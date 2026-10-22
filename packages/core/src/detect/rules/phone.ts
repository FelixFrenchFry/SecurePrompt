import { createRuleDetector, keepLongest, type RuleMatch } from './rule';

// phone numbers in three structural formats, plain digit runs are left to the model:
// - international: "+" and 8-15 digits in groups ("+44 20 1234 5678", "+1 (800) 123-4567")
// - North American: 3-3-4 digits, optional leading "1" and extension ("(416) 123-4567")
// - national: trunk prefix 0 and 9-13 digits in groups ("0171-2345678", "02 25 24 15 91")
// no checksum exists, so matches are unvalidated

// "+", then up to 8 digit groups (a bracketed group allowed), each separated by at most one [ .-]
const INTERNATIONAL =
    /(?<![\p{L}\p{N}_+])\+(?:\(\d{1,4}\)|\d{1,6})(?:[ .-]?(?:\(\d{1,4}\)|\d{1,6})){1,7}(?![\p{L}\p{N}_]|[.-]\d)/gu;
const NATIONAL = /(?<![\p{L}\p{N}_+.,/-])0\d{1,5}(?:[ ./-]\d{1,8}){1,4}(?![\p{L}\p{N}_]|[.,/-]\d)/gu;
const NATIONAL_DIGITS = { min: 9, max: 13 };

// two short leading groups only count in the all-pairs layout, unlike dates ("01.02.2024 14")
const isNationalLayout = (value: string): boolean =>
{
    const groups = value.split(/[ ./-]/);
    const digits = groups.join('').length;

    if (groups.length < 2)
    {
        return false;
    }

    const startsLikeDate = groups[0]!.length <= 2 && groups[1]!.length <= 2;

    return (
        digits >= NATIONAL_DIGITS.min &&
        digits <= NATIONAL_DIGITS.max &&
        (!startsLikeDate || groups.every((group) => group.length === 2))
    );
};
const NANP =
    /(?<![\p{L}\p{N}_+.-])(?:1[ .-])?(?:\([2-9]\d{2}\) ?|[2-9]\d{2}[ .-])\d{3}[ .-]\d{4}(?: ?(?:x|ext\.?) ?\d{1,5})?(?![\p{L}\p{N}_]|[.-]\d)/gu;

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

export const findPhones = (text: string): RuleMatch[] =>
{
    const matches: RuleMatch[] = [];

    for (const match of text.matchAll(INTERNATIONAL))
    {
        // the pattern may take in a following number, so cut at spaces until the digit count fits
        const cuts = [match[0].length, ...[...match[0].matchAll(/ /g)].map((space) => space.index).reverse()];
        const length = cuts.find((cut) =>
        {
            const digits = match[0].slice(0, cut).replace(/\D/g, '').length;

            return digits >= MIN_DIGITS && digits <= MAX_DIGITS;
        });

        if (length != null)
        {
            const value = match[0].slice(0, length);
            // an unbalanced bracket means the cut split a group
            const balanced = value.split('(').length === value.split(')').length;

            if (balanced)
            {
                matches.push({ start: match.index, end: match.index + length, category: 'PHONE', validated: false });
            }
        }
    }

    for (const match of text.matchAll(NATIONAL))
    {
        // like above, a following number may have been taken in: cut at spaces from the end
        const cuts = [match[0].length, ...[...match[0].matchAll(/ /g)].map((space) => space.index).reverse()];
        const length = cuts.find((cut) => isNationalLayout(match[0].slice(0, cut)));

        if (length != null)
        {
            matches.push({ start: match.index, end: match.index + length, category: 'PHONE', validated: false });
        }
    }

    for (const match of text.matchAll(NANP))
    {
        matches.push({ start: match.index, end: match.index + match[0].length, category: 'PHONE', validated: false });
    }

    return keepLongest(matches);
};

export const phoneRule = createRuleDetector('phone', findPhones);
