import type { TextDocumentFormat } from '../documents/types';

export type AttachedFile = {
    id: string;
    // shown in the side panel only, never sent, as file names may hold personal data
    fileName: string;
    format: TextDocumentFormat;
    size: number;
    text: string;
};

const FENCE_LANGUAGE: Partial<Record<TextDocumentFormat, string>> = { md: 'markdown' };

// the prompt and its files as one text, so one scan masks all of them with shared placeholders
export const composeInput = (prompt: string, files: readonly AttachedFile[]): string =>
{
    const parts = prompt.trim().length > 0 ? [prompt] : [];
    const withText = files.filter((file) => file.text.trim().length > 0);

    withText.forEach((file, index) =>
    {
        const fence = fenceFor(file.text);

        parts.push(`Attached file ${index + 1} (${file.format}):\n\n${fence}${FENCE_LANGUAGE[file.format] ?? file.format}\n${file.text}\n${fence}`);
    });

    return parts.join('\n\n');
};

// a code fence longer than any backtick run in the text, so the file can't close it early
const fenceFor = (text: string): string =>
{
    const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));

    return '`'.repeat(longest + 1);
};
