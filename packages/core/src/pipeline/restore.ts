import type { MaskSession } from '../session';

// replaces this session's placeholders with their originals, exact matches only for now
export const restorePlaceholders = (text: string, session: MaskSession): string =>
{
    const placeholders = session.placeholders();

    if (placeholders.length === 0)
    {
        return text;
    }

    // longest first and never before a digit, so PERSON_1000 and EMAIL_0023704 aren't misread
    const pattern = new RegExp(
        `(?:${placeholders.sort((left, right) => right.length - left.length).join('|')})(?!\\d)`,
        'g',
    );

    return text.replace(pattern, (placeholder) => session.originalFor(placeholder) ?? placeholder);
};
