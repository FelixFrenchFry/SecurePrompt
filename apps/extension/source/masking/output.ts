import { CATEGORIES, type Category, type DetectionSource, type PipelineResult, type Span } from '@secureprompt/core';

// a piece of the reviewed prompt: kept text, a placeholder, or a value the user chose to send as is
export type OutputPart =
    | { kind: 'text'; text: string; start: number }
    | { kind: 'mask'; placeholder: string; category: Category; text: string }
    | { kind: 'revealed'; placeholder: string; category: Category; text: string };

const EXCERPT_LENGTH = 40;

// a value shortened for a tooltip or popover, never the full text of a long address or key
export const excerptOf = (text: string): string => (text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text);

export const outputParts = (input: string, result: PipelineResult, revealed: ReadonlySet<string>): OutputPart[] =>
{
    return result.segments.map((segment): OutputPart =>
    {
        if (segment.kind === 'text')
        {
            return { kind: 'text', text: input.slice(segment.sourceStart, segment.sourceEnd), start: segment.sourceStart };
        }

        const { placeholder, category } = segment;
        const text = input.slice(segment.sourceStart, segment.sourceEnd);

        return { kind: revealed.has(placeholder) ? 'revealed' : 'mask', placeholder, category, text };
    });
};

// the text that leaves the side panel
export const outputText = (parts: readonly OutputPart[]): string =>
{
    return parts.map((part) => (part.kind === 'mask' ? part.placeholder : part.text)).join('');
};

// how many different values each category masked, in the usual category order
export const categoryCounts = (result: PipelineResult): Array<{ category: Category; count: number }> =>
{
    const placeholders = new Map(result.spans.map((span) => [span.placeholder, span.category]));

    return CATEGORIES.map((category) => ({ category, count: [...placeholders.values()].filter((found) => found === category).length })).filter(
        (entry) => entry.count > 0,
    );
};

// a selection without the spaces and line breaks around it, or undefined if nothing is left
export const trimSelection = (input: string, selection: Span): Span | undefined =>
{
    let { start, end } = selection;

    while (start < end && /\s/.test(input[start]!))
    {
        start += 1;
    }

    while (end > start && /\s/.test(input[end - 1]!))
    {
        end -= 1;
    }

    return end > start ? { start, end } : undefined;
};

export type PlaceholderDetails = {
    placeholder: string;
    category: Category;
    mentions: number;
    // how the value was found, from its first mention that wasn't a repeat
    source: DetectionSource;
    detector: string;
};

export const placeholderDetails = (result: PipelineResult, placeholder: string): PlaceholderDetails | undefined =>
{
    const spans = result.spans.filter((span) => span.placeholder === placeholder);
    const first = spans.find((span) => span.source !== 'propagated') ?? spans[0];

    if (first == null)
    {
        return undefined;
    }

    return {
        placeholder,
        category: first.category,
        mentions: spans.length,
        source: first.source,
        detector: first.detector,
    };
};
