// whether a chat input holds the text we inserted; rich editors like ChatGPT's turn each line into
// a paragraph, so blank lines and spaces come back changed and only the words have to match
export const composerHolds = (actual: string, expected: string): boolean =>
{
    return normalize(actual) === normalize(expected);
};

const normalize = (text: string): string =>
{
    return text
        .replace(/[\u200b\u2060\ufeff]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};
