import type { MaskSession } from '../session';
import { PLACEHOLDER_PATTERN } from '../session';
import { compareSpans, subtractRanges, trimSpan } from '../spans';
import { CATEGORIES, type Detection, type Span } from '../types';

// placeholder-shaped tokens anywhere, even glued to other characters ('IDACCOUNT_001')
const EMBEDDED_PLACEHOLDER_PATTERN = new RegExp(`(?:${CATEGORIES.join('|')})_\\d{3,}`, 'g');

// ranges never masked: earlier placeholders, pasted AI answers, masked text in the residual pass
export const findProtectedRanges = (text: string, session: MaskSession): Span[] =>
{
    const ranges: Span[] = [];

    for (const match of text.matchAll(PLACEHOLDER_PATTERN))
    {
        ranges.push({ start: match.index, end: match.index + match[0].length });
    }

    for (const placeholder of session.placeholders())
    {
        for (let index = text.indexOf(placeholder); index !== -1; index = text.indexOf(placeholder, index + 1))
        {
            ranges.push({ start: index, end: index + placeholder.length });
        }
    }

    return mergeRanges(ranges);
};

// placeholders already in the text, never assigned so restoring can't turn them into names
export const findReservedPlaceholders = (text: string): Set<string> =>
{
    return new Set(text.match(EMBEDDED_PLACEHOLDER_PATTERN) ?? []);
};

// cuts protected ranges out of detections, which may split a detection into parts or remove it
export const excludeProtected = (
    text: string,
    detections: readonly Detection[],
    protectedRanges: readonly Span[],
): Detection[] =>
{
    if (protectedRanges.length === 0)
    {
        return [...detections];
    }

    return detections
        .flatMap((detection) => subtractRanges(detection, protectedRanges))
        .map((detection) => trimSpan(text, detection))
        .filter((detection) => detection.end > detection.start);
};

const mergeRanges = (ranges: Span[]): Span[] =>
{
    const merged: Span[] = [];

    for (const range of ranges.sort(compareSpans))
    {
        const last = merged[merged.length - 1];

        if (last != null && range.start <= last.end)
        {
            last.end = Math.max(last.end, range.end);
        }
        else
        {
            merged.push({ ...range });
        }
    }

    return merged;
};
