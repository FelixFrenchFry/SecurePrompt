import { CATEGORIES, isCategory, type Category } from '@secureprompt/core';

// a piece of an AI answer: kept text, a restored original, or a placeholder this session never gave out
export type AnswerPart =
    | { kind: 'text'; text: string }
    | { kind: 'restored'; placeholder: string; category: Category; text: string }
    | { kind: 'unknown'; placeholder: string };

// placeholders as whole tokens, letters may follow ("PERSON_001s"), digits may not ("EMAIL_0023704")
const PLACEHOLDER = new RegExp(`(?<![\\p{L}\\p{N}_])(${CATEGORIES.join('|')})_\\d{3,}(?!\\d)`, 'gu');

export const answerParts = (answer: string, originalFor: (placeholder: string) => string | undefined): AnswerPart[] =>
{
    const parts: AnswerPart[] = [];
    let cursor = 0;

    for (const match of answer.matchAll(PLACEHOLDER))
    {
        const placeholder = match[0];
        const category = match[1]!;
        const original = originalFor(placeholder);

        if (match.index > cursor)
        {
            parts.push({ kind: 'text', text: answer.slice(cursor, match.index) });
        }

        parts.push(original == null || !isCategory(category) ? { kind: 'unknown', placeholder } : { kind: 'restored', placeholder, category, text: original });
        cursor = match.index + placeholder.length;
    }

    if (cursor < answer.length)
    {
        parts.push({ kind: 'text', text: answer.slice(cursor) });
    }

    return parts;
};

// how many placeholders of this session a text holds, which tells a pasted answer from a new prompt
export const knownPlaceholderCount = (text: string, originalFor: (placeholder: string) => string | undefined): number =>
{
    return answerParts(text, originalFor).filter((part) => part.kind === 'restored').length;
};

// the answer with every known placeholder replaced by its original
export const restoredText = (parts: readonly AnswerPart[]): string =>
{
    return parts.map((part) => (part.kind === 'unknown' ? part.placeholder : part.text)).join('');
};
