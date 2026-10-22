import type { Span } from './types';

export const overlaps = (left: Span, right: Span): boolean =>
{
    return left.start < right.end && right.start < left.end;
};

export const compareSpans = (left: Span, right: Span): number =>
{
    return left.start - right.start || left.end - right.end;
};

const WHITESPACE = /\s/;

// shrinks a span so it doesn't start or end with whitespace, possibly to an empty span
export const trimSpan = <T extends Span>(text: string, span: T): T =>
{
    let { start, end } = span;

    while (start < end && WHITESPACE.test(text[start]!))
    {
        start += 1;
    }

    while (end > start && WHITESPACE.test(text[end - 1]!))
    {
        end -= 1;
    }

    return { ...span, start, end };
};

// the parts of a span that lie outside all blocked ranges (blocked must be sorted)
export const subtractRanges = <T extends Span>(span: T, blocked: readonly Span[]): T[] =>
{
    const parts: T[] = [];
    let cursor = span.start;

    for (const range of blocked)
    {
        if (range.end <= cursor)
        {
            continue;
        }

        if (range.start >= span.end)
        {
            break;
        }

        if (range.start > cursor)
        {
            parts.push({ ...span, start: cursor, end: range.start });
        }

        cursor = Math.max(cursor, range.end);
    }

    if (cursor < span.end)
    {
        parts.push({ ...span, start: cursor, end: span.end });
    }

    return parts;
};
