import type { Span } from '@secureprompt/core';

// overlapping windows, so long inputs fit and boundary entities are seen whole in one
export const createWindows = (tokenCount: number, maxContentTokens: number, overlap: number): Span[] =>
{
    if (overlap >= maxContentTokens)
    {
        throw new RangeError('Window overlap must be smaller than the window');
    }

    const windows: Span[] = [];

    for (let start = 0; ; start += maxContentTokens - overlap)
    {
        const end = Math.min(tokenCount, start + maxContentTokens);

        windows.push({ start, end });

        if (end >= tokenCount)
        {
            return windows;
        }
    }
};
